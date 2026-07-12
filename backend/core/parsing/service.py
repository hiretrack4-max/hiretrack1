"""
Resume parsing orchestration (BRD Modules 2 & 3).

``parse_resume(resume)`` runs the full pipeline synchronously:

1. Mark the Resume ``PROCESSING``.
2. Extract raw text (stored on ``Resume.raw_text``).
3. Run the configured field extractor, falling back from Claude to the
   heuristic extractor on any Claude error (recording which was used).
4. Atomically create/update the linked Candidate, replace its skills and
   experience rows, link the resume, and refresh the search caches.
5. Mark the Resume ``PARSED`` with ``parsed_at`` set — or ``FAILED`` with
   ``parse_error`` on failure. The Resume is never left ``PROCESSING``.

Candidate de-duplication: if the Resume already has a candidate, that record is
updated in place. Otherwise, if the parsed email matches an existing candidate,
the resume is linked to (and updates) that candidate — this keeps a person's
multiple resume uploads under one profile. Only when neither holds is a new
Candidate created. Deliberate choice: email is the stable natural key for a
single-user portal; name collisions are common, emails are not.
"""
from __future__ import annotations

import contextlib
import datetime
import logging
import os
import tempfile
from decimal import Decimal, InvalidOperation
from typing import Optional

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from ..models import Candidate, CandidateExperience, CandidateSkill, Resume
from .extract import ExtractionError, extract_text
from .extractor import (
    CERTIFICATION,
    ClaudeResumeExtractor,
    HeuristicResumeExtractor,
    ParsedResume,
    get_extractor,
)

logger = logging.getLogger(__name__)

# DecimalField(max_digits=4, decimal_places=1) on Candidate -> max 999.9.
_MAX_YEARS = Decimal("999.9")


@contextlib.contextmanager
def _local_resume_path(file_field):
    """Yield a local filesystem path for a resume ``FieldFile``.

    Local/dev storage exposes ``file.path`` directly. Remote S3-compatible
    storage (Supabase, R2) does NOT — accessing ``.path`` raises
    ``NotImplementedError`` — so the file is streamed down to a short-lived temp
    file whose path is yielded instead (and removed afterwards). This is what
    makes resume parsing work in production, where uploads live in Supabase.
    """
    try:
        path = file_field.path
    except (NotImplementedError, ValueError):
        path = None
    if path:
        yield path
        return

    suffix = os.path.splitext(file_field.name or "")[1]
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        file_field.open("rb")
        try:
            for chunk in file_field.chunks():
                tmp.write(chunk)
        finally:
            file_field.close()
        tmp.close()
        yield tmp.name
    finally:
        with contextlib.suppress(OSError):
            os.remove(tmp.name)


def parse_resume(resume: Resume) -> None:
    """Parse ``resume`` and populate its Candidate. Safe to call synchronously.

    Sets ``parse_status`` to PARSED on success or FAILED on error (never leaves
    it PROCESSING). Raises nothing for the ordinary failure paths (extraction /
    persistence) — the outcome is recorded on the Resume so the upload request
    stays resilient. Truly unexpected errors are still recorded as FAILED.
    """
    if not getattr(settings, "RESUME_PARSING_ENABLED", True):
        logger.info("Resume parsing disabled; leaving resume %s PENDING.", resume.pk)
        return

    resume.parse_status = Resume.ParseStatus.PROCESSING
    resume.parse_error = ""
    resume.save(update_fields=["parse_status", "parse_error"])

    # --- 1 & 2: extract raw text ------------------------------------------
    # Works for both local storage (file.path) and remote S3/Supabase storage
    # (no local path -> stream to a temp file first).
    try:
        with _local_resume_path(resume.file) as local_path:
            text = extract_text(local_path, resume.file_type)
    except ExtractionError as exc:
        _fail(resume, str(exc))
        return
    except Exception as exc:  # unexpected I/O / decoding error
        logger.exception("Unexpected error extracting text from resume %s.", resume.pk)
        _fail(resume, f"Text extraction failed: {exc}")
        return

    resume.raw_text = text

    # --- 3: run the extractor (Claude with heuristic fallback) ------------
    parsed, used = _run_extractor(text)
    logger.info("Resume %s parsed via '%s' extractor.", resume.pk, used)

    # --- 4 & 5: persist -----------------------------------------------------
    try:
        with transaction.atomic():
            candidate = _upsert_candidate(resume, parsed)
            _replace_skills(candidate, parsed)
            _replace_experiences(candidate, parsed)
            candidate.rebuild_skills_cache()

            resume.candidate = candidate
            resume.parse_status = Resume.ParseStatus.PARSED
            resume.parsed_at = timezone.now()
            resume.save(
                update_fields=[
                    "candidate",
                    "raw_text",
                    "parse_status",
                    "parsed_at",
                    "parse_error",
                ]
            )
    except Exception as exc:  # persistence failure -> FAILED, don't leave PROCESSING
        logger.exception("Failed to persist parsed resume %s.", resume.pk)
        _fail(resume, f"Failed to save parsed data: {exc}", raw_text=text)
        return


def _run_extractor(text: str) -> tuple[ParsedResume, str]:
    """Run the configured extractor; fall back to heuristic on Claude failure."""
    extractor = get_extractor()
    if isinstance(extractor, ClaudeResumeExtractor):
        try:
            return extractor.extract(text), "claude"
        except Exception:
            logger.warning(
                "Claude extractor failed; falling back to heuristic.", exc_info=True
            )
            return HeuristicResumeExtractor().extract(text), "heuristic (claude-fallback)"
    return extractor.extract(text), extractor.name


def parse_resume_preview(uploaded_file, file_type: str) -> dict:
    """Parse an *uploaded* resume file and return its fields WITHOUT persisting.

    Used by the "Add Candidate" flow so the form can be prefilled from a resume
    the user has only just dropped in — nothing is written to the database until
    the user actually clicks Save. The file is streamed to a short-lived temp
    file (the extractors work off a path), parsed, and the temp file removed.

    Returns a plain JSON-serialisable dict mirroring the Candidate form fields
    plus ``skills``, ``experiences`` and ``parse_flags`` so the UI can badge
    fields the parser was unsure about. Raises ``ExtractionError`` if the file's
    text cannot be read.
    """
    suffix = f".{(file_type or '').lstrip('.')}" if file_type else ""
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            for chunk in uploaded_file.chunks():
                tmp.write(chunk)
            tmp_path = tmp.name
        text = extract_text(tmp_path, file_type)
    finally:
        if tmp_path:
            try:
                os.remove(tmp_path)
            except OSError:
                logger.warning("Could not remove temp resume file %s.", tmp_path)

    parsed, used = _run_extractor(text)
    logger.info("Resume preview parsed via '%s' extractor.", used)
    return _parsed_to_dict(parsed)


def _parsed_to_dict(parsed: ParsedResume) -> dict:
    """Serialise a ParsedResume into the shape the Add-Candidate form consumes."""
    total = _clamp_years(parsed.total_experience_years)
    relevant = _clamp_years(parsed.relevant_experience_years)
    return {
        "full_name": parsed.full_name or "",
        "email": parsed.email or "",
        "mobile": parsed.mobile or "",
        "address": parsed.address or "",
        "current_location": parsed.current_location or "",
        "current_company": parsed.current_company or "",
        "current_designation": parsed.current_designation or "",
        "highest_qualification": parsed.highest_qualification or "",
        "total_experience_years": str(total) if total is not None else "",
        "relevant_experience_years": str(relevant) if relevant is not None else "",
        "skills": [
            {
                "name": (item.get("name") or "").strip(),
                "type": item.get("type", CandidateSkill.SkillType.SKILL),
            }
            for item in parsed.skills
            if (item.get("name") or "").strip()
        ],
        "certifications": [c for c in (parsed.certifications or []) if c],
        "experiences": [
            {
                "company": (item.get("company") or "").strip(),
                "designation": (item.get("designation") or "").strip(),
                "start_date": item.get("start_date") or "",
                "end_date": item.get("end_date") or "",
                "is_current": bool(item.get("is_current", False)),
            }
            for item in parsed.experiences
            if (item.get("company") or "").strip()
            or (item.get("designation") or "").strip()
        ],
        "parse_flags": [str(f) for f in (parsed.parse_flags or [])],
    }


def _fail(resume: Resume, message: str, raw_text: Optional[str] = None) -> None:
    resume.parse_status = Resume.ParseStatus.FAILED
    resume.parse_error = message[:2000]
    fields = ["parse_status", "parse_error"]
    if raw_text is not None:
        resume.raw_text = raw_text
        fields.append("raw_text")
    resume.save(update_fields=fields)


# ---------------------------------------------------------------------------
# Candidate upsert
# ---------------------------------------------------------------------------
def _upsert_candidate(resume: Resume, parsed: ParsedResume) -> Candidate:
    candidate = resume.candidate

    if candidate is None and parsed.email:
        candidate = (
            Candidate.objects.filter(email__iexact=parsed.email)
            .order_by("created_at")
            .first()
        )

    full_name = parsed.full_name or (candidate.full_name if candidate else "")
    if not full_name:
        # Candidate.full_name is NOT NULL; derive a placeholder the HR user edits.
        full_name = (resume.original_filename or "Unknown Candidate")[:150]

    total = _clamp_years(parsed.total_experience_years)
    relevant = _clamp_years(parsed.relevant_experience_years)

    if candidate is None:
        candidate = Candidate(candidate_status=Candidate.Status.RESUME_RECEIVED)

    candidate.full_name = full_name[:150]
    # Only overwrite parsed fields when we actually extracted a value, so a
    # re-parse or a second resume never blanks out good existing data.
    _set_if(candidate, "email", parsed.email, 254)
    _set_if(candidate, "mobile", parsed.mobile, 20)
    _set_if(candidate, "address", parsed.address, None)  # TextField, no cap
    _set_if(candidate, "current_location", parsed.current_location, 150)
    _set_if(candidate, "current_company", parsed.current_company, 150)
    _set_if(candidate, "current_designation", parsed.current_designation, 150)
    _set_if(candidate, "highest_qualification", parsed.highest_qualification, 150)
    if total is not None:
        candidate.total_experience_years = total
    if relevant is not None:
        candidate.relevant_experience_years = relevant

    # Persist the parser's "could not extract" flags so the UI can badge fields
    # for HR to verify. Reflects the latest parse (overwrites any prior flags).
    candidate.parse_flags = [str(f) for f in (parsed.parse_flags or [])]

    candidate.save()
    return candidate


def _set_if(candidate: Candidate, field: str, value: str, maxlen: Optional[int]) -> None:
    if value:
        setattr(candidate, field, value[:maxlen] if maxlen else value)


def _clamp_years(value) -> Optional[Decimal]:
    if value is None:
        return None
    try:
        dec = Decimal(str(round(float(value), 1)))
    except (InvalidOperation, ValueError, TypeError):
        return None
    if dec < 0:
        return Decimal("0.0")
    return min(dec, _MAX_YEARS)


# ---------------------------------------------------------------------------
# Skills / experiences replacement
# ---------------------------------------------------------------------------
def _replace_skills(candidate: Candidate, parsed: ParsedResume) -> None:
    """Replace the candidate's skill rows with the freshly parsed set."""
    candidate.skills.all().delete()

    rows: list[CandidateSkill] = []
    seen: set[tuple[str, str]] = set()

    def add(name: str, skill_type: str) -> None:
        name = (name or "").strip()[:100]
        if not name:
            return
        key = (name.lower(), skill_type)
        if key in seen:
            return
        seen.add(key)
        rows.append(
            CandidateSkill(candidate=candidate, name=name, skill_type=skill_type)
        )

    for item in parsed.skills:
        add(item.get("name", ""), item.get("type", CandidateSkill.SkillType.SKILL))
    for cert in parsed.certifications:
        add(cert, CERTIFICATION)

    if rows:
        # ignore_conflicts guards the (candidate, name, skill_type) unique constraint.
        CandidateSkill.objects.bulk_create(rows, ignore_conflicts=True)


def _replace_experiences(candidate: Candidate, parsed: ParsedResume) -> None:
    candidate.experiences.all().delete()

    rows: list[CandidateExperience] = []
    for item in parsed.experiences:
        company = (item.get("company") or "").strip()[:150]
        designation = (item.get("designation") or "").strip()[:150]
        if not company and not designation:
            continue
        rows.append(
            CandidateExperience(
                candidate=candidate,
                company=company,
                designation=designation,
                start_date=_parse_date(item.get("start_date")),
                end_date=_parse_date(item.get("end_date")),
                is_current=bool(item.get("is_current", False)),
            )
        )
    if rows:
        CandidateExperience.objects.bulk_create(rows)


def _parse_date(value) -> Optional[datetime.date]:
    """Parse 'YYYY-MM-DD' / 'YYYY-MM' / 'YYYY' (or a date) into a date, else None."""
    if isinstance(value, datetime.date):
        return value
    if not isinstance(value, str):
        return None
    value = value.strip()
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y-%m", "%Y/%m", "%Y"):
        try:
            return datetime.datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None
