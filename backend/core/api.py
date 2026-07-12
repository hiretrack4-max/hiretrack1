"""
HireTrack REST API — ViewSets, filters, global search and dashboard stats.

Kept separate from ``core/views.py`` (which holds the healthz probe from the
foundation task). Everything here is mounted under ``/api/`` by ``core/urls.py``.

Deferred to later tasks (NOT implemented here):
    * Resume parsing internals — the upload action only stores the file and marks
      it PENDING, leaving a clearly marked hook.
    * Report file generation (Excel/CSV/PDF) — only ReportConfiguration CRUD.
    * Notifications (Module 10) and the React frontend.
"""
import datetime
import logging
import os

from django.contrib.postgres.search import SearchQuery, SearchRank
from django.db import transaction
from django.db.models import Count, F, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django_filters import rest_framework as df_filters
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.negotiation import DefaultContentNegotiation
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .audit import get_current_user
from .parsing import parse_job_description, parse_resume, parse_resume_preview
from .parsing import ExtractionError
from . import reports
from .models import (
    AuditLog,
    Candidate,
    CandidateJobMapping,
    Interview,
    Job,
    Notification,
    Offer,
    RecruitmentStatus,
    ReportConfiguration,
    Resume,
)
from .serializers import (
    AuditLogSerializer,
    CandidateJobMappingSerializer,
    CandidateListSerializer,
    CandidateSerializer,
    CandidateSetStatusSerializer,
    InterviewSerializer,
    JobSerializer,
    NotificationSerializer,
    OfferSerializer,
    RecruitmentStatusSerializer,
    RecycleBinCandidateSerializer,
    RecycleBinJobSerializer,
    ReportConfigurationSerializer,
    ResumeSerializer,
    ResumeUploadSerializer,
)

logger = logging.getLogger(__name__)

# Accepted resume formats (Module 2). Mirrors settings.RESUME_ALLOWED_EXTENSIONS.
_EXT_TO_FILE_TYPE = {
    "pdf": Resume.FileType.PDF,
    "doc": Resume.FileType.DOC,
    "docx": Resume.FileType.DOCX,
}
_ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",  # some browsers send this for .doc/.docx
}


# ---------------------------------------------------------------------------
# Filters (Module 1/4/5/6)
# ---------------------------------------------------------------------------
class JobFilter(df_filters.FilterSet):
    class Meta:
        model = Job
        fields = ["job_status", "department", "employment_type", "is_archived"]


class CandidateFilter(df_filters.FilterSet):
    class Meta:
        model = Candidate
        fields = ["candidate_status", "current_location"]


class MappingFilter(df_filters.FilterSet):
    class Meta:
        model = CandidateJobMapping
        fields = ["job", "candidate", "mapping_status", "recruiter_name"]


class InterviewFilter(df_filters.FilterSet):
    # Range support: interview_date_after / interview_date_before.
    interview_date = df_filters.DateFromToRangeFilter()

    class Meta:
        model = Interview
        fields = ["interview_date", "mapping", "result"]


class OfferFilter(df_filters.FilterSet):
    class Meta:
        model = Offer
        fields = ["offer_status", "mapping"]


# ---------------------------------------------------------------------------
# Module 1 & 6 — Job
# ---------------------------------------------------------------------------
class JobViewSet(viewsets.ModelViewSet):
    serializer_class = JobSerializer
    filterset_class = JobFilter
    search_fields = ["job_id", "job_role", "department", "hiring_manager", "location"]
    ordering_fields = ["created_at", "job_role", "department", "job_status"]
    ordering = ["-created_at"]

    def get_queryset(self):
        # ``Job.objects`` hides soft-deleted jobs (default SoftDeleteManager).
        # The candidate count also excludes mappings to soft-deleted candidates
        # so no Recycle-Bin data leaks into the count.
        return (
            Job.objects.select_related("description")
            .annotate(
                candidate_count=Count(
                    "candidate_mappings",
                    filter=Q(candidate_mappings__candidate__deleted_at__isnull=True),
                    distinct=True,
                )
            )
        )

    def perform_destroy(self, instance):
        # Soft delete (Recycle Bin): stamp ``deleted_at`` instead of erasing.
        instance.soft_delete()

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Restore a soft-deleted job from the Recycle Bin."""
        job = get_object_or_404(Job.all_objects, pk=pk)
        job.restore()
        return Response(JobSerializer(job, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["delete"])
    def purge(self, request, pk=None):
        """Permanently delete a job (hard delete; not restorable)."""
        job = get_object_or_404(Job.all_objects, pk=pk)
        job.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["post"])
    def parse_description(self, request):
        """Extract structured fields from a pasted job description (Module 1).

        POST /api/jobs/parse_description/  body: {"description": "<pasted text>"}
        Returns {location, number_of_openings, salary_min, salary_max,
        salary_currency} so the Job create/edit form can pre-fill. Uses the same
        Claude-with-heuristic-fallback pipeline as resume parsing (works with
        ANTHROPIC_API_KEY empty).
        """
        text = request.data.get("description")
        if not isinstance(text, str) or not text.strip():
            raise ValidationError({"description": "This field is required."})
        parsed = parse_job_description(text)
        return Response(parsed.as_response())

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        job = self.get_object()
        job.is_archived = True
        job.save(update_fields=["is_archived", "updated_at"])
        return Response(self.get_serializer(job).data)

    @action(detail=True, methods=["post"])
    def unarchive(self, request, pk=None):
        job = self.get_object()
        job.is_archived = False
        job.save(update_fields=["is_archived", "updated_at"])
        return Response(self.get_serializer(job).data)


# ---------------------------------------------------------------------------
# Modules 3 & 5 — Candidate
# ---------------------------------------------------------------------------
class CandidateViewSet(viewsets.ModelViewSet):
    filterset_class = CandidateFilter
    search_fields = ["full_name", "email", "mobile", "current_location", "skills_cache"]
    ordering_fields = ["created_at", "full_name", "candidate_status"]
    ordering = ["-created_at"]

    def get_queryset(self):
        # ``Candidate.objects`` hides soft-deleted candidates (SoftDeleteManager).
        qs = Candidate.objects.all()
        if self.action == "retrieve":
            qs = qs.prefetch_related("skills", "experiences", "job_mappings__job")
        return qs

    def perform_destroy(self, instance):
        # Soft delete (Recycle Bin): stamp ``deleted_at`` instead of erasing.
        instance.soft_delete()

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        """Restore a soft-deleted candidate from the Recycle Bin."""
        candidate = get_object_or_404(Candidate.all_objects, pk=pk)
        candidate.restore()
        return Response(
            CandidateListSerializer(candidate, context=self.get_serializer_context()).data
        )

    @action(detail=True, methods=["delete"])
    def purge(self, request, pk=None):
        """Permanently delete a candidate (hard delete; not restorable)."""
        candidate = get_object_or_404(Candidate.all_objects, pk=pk)
        candidate.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def get_serializer_class(self):
        if self.action == "list":
            return CandidateListSerializer
        if self.action == "set_status":
            return CandidateSetStatusSerializer
        return CandidateSerializer

    @action(detail=True, methods=["post"])
    def set_status(self, request, pk=None):
        """Change candidate_status (Module 6 / User Story 7).

        The status-history row in RecruitmentStatus is written automatically by
        the ``_record_candidate_status`` post_save signal, which compares against
        the pre_save snapshot — so a normal ``save()`` here records the transition.
        """
        candidate = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_status = serializer.validated_data["candidate_status"]
        candidate.candidate_status = new_status
        candidate.save(update_fields=["candidate_status", "updated_at"])

        # Attach optional notes to the history row the signal just created.
        notes = serializer.validated_data.get("notes")
        if notes:
            latest = candidate.status_history.first()
            if latest is not None:
                latest.notes = notes
                latest.save(update_fields=["notes"])

        return Response(CandidateSerializer(candidate, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["post"])
    def tag(self, request, pk=None):
        """Tag this candidate to a job (Module 4).

        POST /api/candidates/{id}/tag/  body: {"job": <job id>}
        Creates the CandidateJobMapping (idempotent — a repeat tag is a no-op) and
        returns the updated candidate. Honors the closed-job rule (User Story 2):
        a closed/archived job is rejected with 400.
        """
        candidate = self.get_object()
        job = self._resolve_job(request.data.get("job"))
        if not job.is_open_for_mapping:
            raise ValidationError(
                {"job": "This job is closed/archived and cannot accept new candidate "
                        "mappings unless reopened."}
            )
        user = get_current_user()
        recruiter = ""
        if user is not None:
            recruiter = (user.get_full_name() or user.get_username() or "")[:150]
        CandidateJobMapping.objects.get_or_create(
            candidate=candidate,
            job=job,
            defaults={"recruiter_name": recruiter},
        )
        return Response(self._candidate_response(candidate))

    @action(detail=True, methods=["post"])
    def untag(self, request, pk=None):
        """Untag this candidate from a job (Module 4).

        POST /api/candidates/{id}/untag/  body: {"job": <job id>}
        Deletes the CandidateJobMapping (a no-op if it does not exist) and returns
        the updated candidate.
        """
        candidate = self.get_object()
        job = self._resolve_job(request.data.get("job"))
        CandidateJobMapping.objects.filter(candidate=candidate, job=job).delete()
        return Response(self._candidate_response(candidate))

    @staticmethod
    def _resolve_job(job_id):
        if job_id in (None, ""):
            raise ValidationError({"job": "This field is required."})
        try:
            return Job.objects.get(pk=job_id)
        except (Job.DoesNotExist, ValueError, TypeError):
            raise ValidationError({"job": f"Job '{job_id}' not found."})

    def _candidate_response(self, candidate):
        # Re-fetch with the same prefetch the retrieve action uses so the nested
        # job_mappings reflect the tag/untag we just applied.
        fresh = (
            Candidate.objects.prefetch_related(
                "skills", "experiences", "job_mappings__job"
            ).get(pk=candidate.pk)
        )
        return CandidateSerializer(fresh, context=self.get_serializer_context()).data


# ---------------------------------------------------------------------------
# Module 4 — Candidate Job Mapping
# ---------------------------------------------------------------------------
class CandidateJobMappingViewSet(viewsets.ModelViewSet):
    serializer_class = CandidateJobMappingSerializer
    filterset_class = MappingFilter
    search_fields = ["recruiter_name", "candidate__full_name", "job__job_role"]
    ordering_fields = ["applied_date", "created_at", "mapping_status"]
    ordering = ["-applied_date"]

    def get_queryset(self):
        # Hide mappings whose candidate or job is in the Recycle Bin (mappings
        # have no ``deleted_at`` of their own, so they must be filtered explicitly).
        return CandidateJobMapping.objects.select_related("candidate", "job").filter(
            candidate__deleted_at__isnull=True, job__deleted_at__isnull=True
        )


# ---------------------------------------------------------------------------
# Module 5 — Interview & Offer
# ---------------------------------------------------------------------------
class InterviewViewSet(viewsets.ModelViewSet):
    serializer_class = InterviewSerializer
    filterset_class = InterviewFilter
    ordering_fields = ["interview_date", "interview_time", "created_at"]
    ordering = ["interview_date", "interview_time"]

    def get_queryset(self):
        # Exclude interviews whose candidate or job is in the Recycle Bin.
        return Interview.objects.select_related("mapping__candidate", "mapping__job").filter(
            mapping__candidate__deleted_at__isnull=True,
            mapping__job__deleted_at__isnull=True,
        )


class OfferViewSet(viewsets.ModelViewSet):
    serializer_class = OfferSerializer
    filterset_class = OfferFilter
    ordering_fields = ["offer_date", "offer_status", "created_at"]
    ordering = ["-offer_date"]

    def get_queryset(self):
        # Exclude offers whose candidate or job is in the Recycle Bin.
        return Offer.objects.select_related("mapping__candidate", "mapping__job").filter(
            mapping__candidate__deleted_at__isnull=True,
            mapping__job__deleted_at__isnull=True,
        )


# ---------------------------------------------------------------------------
# Module 2 — Resume (upload only; parsing deferred)
# ---------------------------------------------------------------------------
class ResumeViewSet(viewsets.ModelViewSet):
    serializer_class = ResumeSerializer
    ordering_fields = ["uploaded_at", "parse_status"]
    ordering = ["-uploaded_at"]

    def get_queryset(self):
        # Hide resumes belonging to a soft-deleted candidate (Recycle Bin), while
        # still showing not-yet-linked resumes (candidate is null).
        return (
            Resume.objects.select_related("candidate")
            .filter(Q(candidate__isnull=True) | Q(candidate__deleted_at__isnull=True))
        )

    @action(
        detail=False,
        methods=["post"],
        parser_classes=[MultiPartParser, FormParser],
        serializer_class=ResumeUploadSerializer,
    )
    def parse_preview(self, request):
        """Parse an uploaded resume and return its fields WITHOUT persisting.

        Powers the "Add Candidate" form: the dropped resume is parsed so the
        form can be prefilled, but no Resume or Candidate row is written until
        the user actually clicks Save (which then calls ``upload``). This fixes
        the bug where merely dropping a resume created a candidate.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        upload = serializer.validated_data["file"]

        ext = os.path.splitext(upload.name)[1].lstrip(".").lower()
        if ext not in _EXT_TO_FILE_TYPE:
            raise ValidationError(
                {"file": f"Unsupported format '.{ext}'. Allowed: PDF, DOC, DOCX."}
            )
        content_type = getattr(upload, "content_type", "") or ""
        if content_type and content_type not in _ALLOWED_CONTENT_TYPES:
            raise ValidationError(
                {"file": f"Unsupported content type '{content_type}'. "
                         "Allowed: PDF, DOC, DOCX."}
            )

        try:
            fields = parse_resume_preview(upload, _EXT_TO_FILE_TYPE[ext])
        except ExtractionError as exc:
            raise ValidationError({"file": str(exc)})

        return Response(
            {"filename": upload.name[:255], "fields": fields},
            status=status.HTTP_200_OK,
        )

    @action(
        detail=False,
        methods=["post"],
        parser_classes=[MultiPartParser, FormParser],
        serializer_class=ResumeUploadSerializer,
    )
    def upload(self, request):
        """Upload a resume (PDF/DOC/DOCX), store it, and parse it (Modules 2 & 3)."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        upload = serializer.validated_data["file"]
        candidate = serializer.validated_data.get("candidate")

        ext = os.path.splitext(upload.name)[1].lstrip(".").lower()
        if ext not in _EXT_TO_FILE_TYPE:
            raise ValidationError(
                {"file": f"Unsupported format '.{ext}'. Allowed: PDF, DOC, DOCX."}
            )
        content_type = getattr(upload, "content_type", "") or ""
        if content_type and content_type not in _ALLOWED_CONTENT_TYPES:
            raise ValidationError(
                {"file": f"Unsupported content type '{content_type}'. "
                         "Allowed: PDF, DOC, DOCX."}
            )

        resume = Resume.objects.create(
            candidate=candidate,
            file=upload,
            original_filename=upload.name[:255],
            file_type=_EXT_TO_FILE_TYPE[ext],
            parse_status=Resume.ParseStatus.PENDING,
        )

        # Parse synchronously (single-user load; targets the ~10s budget). A
        # parse failure must NOT fail the upload — the file is already stored and
        # parse_resume records FAILED + parse_error on the Resume itself. We only
        # guard against a truly unexpected crash so the 201 is always returned.
        try:
            parse_resume(resume)
        except Exception:  # pragma: no cover - defensive; parse_resume self-reports
            logger.exception("Unexpected error while parsing uploaded resume %s.", resume.pk)
        resume.refresh_from_db()

        return Response(
            ResumeSerializer(resume, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def reparse(self, request, pk=None):
        """Re-run resume parsing on demand (POST /api/resumes/{id}/reparse/).

        Re-extracts text and re-populates the linked Candidate. Resilient: a
        parse failure is recorded on the Resume (FAILED + parse_error) and still
        returned as 200 with the resume's current parse_status.
        """
        resume = self.get_object()
        try:
            parse_resume(resume)
        except Exception:  # pragma: no cover - defensive; parse_resume self-reports
            logger.exception("Unexpected error while reparsing resume %s.", resume.pk)
        resume.refresh_from_db()
        return Response(
            ResumeSerializer(resume, context=self.get_serializer_context()).data
        )


# ---------------------------------------------------------------------------
# Module 8 — Report configuration (CRUD only; file generation deferred)
# ---------------------------------------------------------------------------
class ReportConfigurationViewSet(viewsets.ModelViewSet):
    serializer_class = ReportConfigurationSerializer
    queryset = ReportConfiguration.objects.all()
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]

    def perform_create(self, serializer):
        serializer.save(created_by=get_current_user())


# ---------------------------------------------------------------------------
# Module 8 — Report export (Excel / CSV / PDF)
# ---------------------------------------------------------------------------
_FORMAT_ALIASES = {
    "excel": ReportConfiguration.ExportFormat.EXCEL,
    "xlsx": ReportConfiguration.ExportFormat.EXCEL,
    "csv": ReportConfiguration.ExportFormat.CSV,
    "pdf": ReportConfiguration.ExportFormat.PDF,
}


class _IgnoreFormatQueryNegotiation(DefaultContentNegotiation):
    """Content negotiation that ignores the ``?format=`` query param.

    This endpoint uses ``?format=`` for the *report* format (excel/csv/pdf),
    which collides with DRF's ``URL_FORMAT_OVERRIDE`` (also ``format``) and would
    otherwise make DRF hunt for a renderer named e.g. ``csv`` and raise 404. The
    success path returns a raw ``HttpResponse``; renderers only matter for the
    JSON error responses, so we always negotiate to the first (JSON) renderer.
    """

    def select_renderer(self, request, renderers, format_suffix=None):
        return renderers[0], renderers[0].media_type


class ReportExportView(APIView):
    """
    GET /api/reports/export/

    Generates and downloads a recruitment report (Module 8) as an attachment.

    Query params (all optional except that a format & date filter must resolve):
        * ``format``      — ``excel`` | ``csv`` | ``pdf``
        * ``date_filter`` — one of ReportConfiguration.DateFilter values
                            (TODAY, YESTERDAY, THIS_WEEK, LAST_WEEK, THIS_MONTH,
                             LAST_MONTH, THIS_YEAR, CUSTOM)
        * ``start``,``end`` — ``YYYY-MM-DD`` (required when date_filter=CUSTOM)
        * ``columns``     — comma-separated column keys (subset/reorder); default all
        * ``report_type`` — ``candidate`` (default candidate-data export), ``job``
                            (per-job report + status summary), or ``openings``
                            (openings over time; ignores date_filter, uses ``grain``)
        * ``grain``       — ``week`` | ``month`` | ``year`` (default ``month``); only
                            used by ``report_type=openings``
        * ``config``      — a saved ReportConfiguration id supplying defaults for
                            all of the above; explicit query params override it.

    Returns an ``HttpResponse`` with the correct ``Content-Type`` and a
    ``Content-Disposition: attachment; filename=...`` header. Bad format / date
    params yield 400.
    """

    content_negotiation_class = _IgnoreFormatQueryNegotiation

    def get(self, request):
        params = request.query_params

        # --- Report type (candidate default | job). Accept query or body. ---
        report_type = (
            params.get("report_type")
            or request.data.get("report_type")
            or reports.REPORT_TYPE_CANDIDATE
        )
        report_type = str(report_type).strip().lower()
        if report_type not in reports.VALID_REPORT_TYPES:
            return Response(
                {"detail": "Invalid 'report_type'. Use 'candidate' or 'job'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # --- Optional saved config supplies the defaults --------------------
        cfg = None
        config_id = params.get("config")
        if config_id:
            try:
                cfg = ReportConfiguration.objects.get(pk=config_id)
            except (ReportConfiguration.DoesNotExist, ValueError, TypeError):
                return Response(
                    {"detail": f"ReportConfiguration '{config_id}' not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

        # --- Format (explicit query param overrides config) ----------------
        fmt_raw = params.get("format")
        if fmt_raw:
            export_format = _FORMAT_ALIASES.get(fmt_raw.strip().lower())
            if export_format is None:
                return Response(
                    {"detail": "Invalid 'format'. Use excel, csv or pdf."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        elif cfg is not None:
            export_format = cfg.export_format
        else:
            export_format = ReportConfiguration.ExportFormat.EXCEL

        # --- Date filter (explicit overrides config) -----------------------
        df_raw = params.get("date_filter")
        if df_raw:
            date_filter = df_raw.strip().upper()
            valid = {c for c, _ in ReportConfiguration.DateFilter.choices}
            if date_filter not in valid:
                return Response(
                    {"detail": "Invalid 'date_filter'. One of: "
                               + ", ".join(sorted(valid)) + "."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        elif cfg is not None:
            date_filter = cfg.date_filter
        else:
            date_filter = ReportConfiguration.DateFilter.THIS_MONTH

        # --- Custom date bounds --------------------------------------------
        custom_start = cfg.custom_start if cfg is not None else None
        custom_end = cfg.custom_end if cfg is not None else None
        if params.get("start"):
            custom_start = self._parse_date(params.get("start"), "start")
        if params.get("end"):
            custom_end = self._parse_date(params.get("end"), "end")

        # --- Columns (explicit overrides config) ---------------------------
        if params.get("columns") is not None:
            columns = [c.strip() for c in params.get("columns").split(",") if c.strip()]
        elif cfg is not None:
            columns = cfg.columns or None
        else:
            columns = None

        # --- Grain (openings report only; week|month|year, default month) --
        grain = (params.get("grain") or reports.GRAIN_MONTH).strip().lower()
        if grain not in reports.VALID_GRAINS:
            return Response(
                {"detail": "Invalid 'grain'. Use week, month or year."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # --- Generate ------------------------------------------------------
        try:
            content, content_type, filename = reports.generate_report(
                export_format,
                date_filter,
                custom_start=custom_start,
                custom_end=custom_end,
                columns=columns,
                report_type=report_type,
                grain=grain,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        response = HttpResponse(content, content_type=content_type)
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        response["Content-Length"] = str(len(content))
        return response

    @staticmethod
    def _parse_date(value, field):
        try:
            return datetime.date.fromisoformat(value.strip())
        except (ValueError, AttributeError):
            raise ValidationError({field: "Expected date in YYYY-MM-DD format."})


# ---------------------------------------------------------------------------
# Module 10 — Notifications
# ---------------------------------------------------------------------------
class NotificationFilter(df_filters.FilterSet):
    class Meta:
        model = Notification
        fields = ["is_read", "event_type"]


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """In-app notifications (Module 10). Rows are created by signals; this API is
    read + mark-as-read only."""

    serializer_class = NotificationSerializer
    queryset = Notification.objects.all()
    filterset_class = NotificationFilter
    ordering_fields = ["created_at", "is_read"]
    ordering = ["-created_at"]

    @action(detail=False, methods=["get"])
    def unread_count(self, request):
        return Response({"unread": self.get_queryset().filter(is_read=False).count()})

    @action(detail=True, methods=["post"])
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        if not notification.is_read:
            notification.is_read = True
            notification.save(update_fields=["is_read"])
        return Response(self.get_serializer(notification).data)

    @action(detail=False, methods=["post"])
    def mark_all_read(self, request):
        marked = self.get_queryset().filter(is_read=False).update(is_read=True)
        return Response({"marked_read": marked})


# ---------------------------------------------------------------------------
# Read-only ViewSets
# ---------------------------------------------------------------------------
class RecruitmentStatusViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = RecruitmentStatusSerializer
    queryset = RecruitmentStatus.objects.select_related("candidate", "changed_by").all()
    filterset_fields = ["candidate", "new_status", "mapping"]
    ordering_fields = ["changed_at"]
    ordering = ["-changed_at"]


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AuditLogSerializer
    queryset = AuditLog.objects.select_related("actor").all()
    filterset_fields = ["action", "model_name", "object_id"]
    search_fields = ["object_repr", "model_name"]
    ordering_fields = ["timestamp"]
    ordering = ["-timestamp"]


# ---------------------------------------------------------------------------
# Module 9 — Global search
# ---------------------------------------------------------------------------
class GlobalSearchView(APIView):
    """
    GET /api/search/?q=<term>

    Searches candidates by name, mobile, email, skills, technologies, job role
    (via mappings) and recruiter (Module 9). Uses the PostgreSQL full-text
    ``search_vector`` (GIN-indexed) for text fields, with icontains fallbacks so
    partial mobile/email/job-role/recruiter terms still match. Returns a compact
    candidate result list (CandidateListSerializer) with a total match count.
    """

    def get(self, request):
        term = (request.query_params.get("q") or "").strip()
        if not term:
            return Response(
                {"detail": "Provide a search term via ?q="},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Full-text match on the precomputed search_vector (name/skills/company/
        # email/location/mobile — see core.signals.refresh_candidate_search).
        query = SearchQuery(term, search_type="plain")

        # Fallback / cross-field predicates: partial matches and mapping-derived
        # fields (job role, recruiter) that are not in the candidate vector.
        fallback = (
            Q(full_name__icontains=term)
            | Q(email__icontains=term)
            | Q(mobile__icontains=term)
            | Q(skills_cache__icontains=term)
            | Q(current_location__icontains=term)
            | Q(job_mappings__job__job_role__icontains=term)
            | Q(job_mappings__recruiter_name__icontains=term)
        )

        candidates = (
            Candidate.objects.filter(Q(search_vector=query) | fallback)
            .annotate(rank=SearchRank(F("search_vector"), query))
            .distinct()
            .order_by("-rank", "-created_at")
        )

        # Respect standard pagination if configured; otherwise cap the payload.
        page_size = 50
        results = candidates[:page_size]
        data = CandidateListSerializer(results, many=True, context={"request": request}).data
        return Response(
            {
                "query": term,
                "count": candidates.count(),
                "results": data,
            }
        )


# ---------------------------------------------------------------------------
# Module 7 — Dashboard stats
# ---------------------------------------------------------------------------
class DashboardStatsView(APIView):
    """
    GET /api/dashboard/stats/

    KPIs + the 4 chart data series, computed with aggregate queries (no Python
    loops over querysets).
    """

    def get(self, request):
        # --- KPIs ------------------------------------------------------------
        job_counts = {
            row["job_status"]: row["n"]
            for row in Job.objects.values("job_status").annotate(n=Count("id"))
        }
        cand_counts = {
            row["candidate_status"]: row["n"]
            for row in Candidate.objects.values("candidate_status").annotate(n=Count("id"))
        }
        total_jobs = sum(job_counts.values())
        total_candidates = sum(cand_counts.values())

        kpis = {
            "total_jobs": total_jobs,
            "open_jobs": job_counts.get(Job.Status.OPEN, 0),
            "closed_jobs": job_counts.get(Job.Status.CLOSED, 0),
            "candidates_uploaded": total_candidates,
            "interview_scheduled": cand_counts.get(Candidate.Status.INTERVIEW_SCHEDULED, 0),
            "offers_released": cand_counts.get(Candidate.Status.OFFER_RELEASED, 0),
            "joined_candidates": cand_counts.get(Candidate.Status.JOINED, 0),
            "rejected_candidates": cand_counts.get(Candidate.Status.REJECTED, 0),
        }

        # --- Chart 1 & 2: candidate status distribution (Hiring Pipeline) ----
        candidate_status_series = [
            {"status": value, "label": label, "count": cand_counts.get(value, 0)}
            for value, label in Candidate.Status.choices
        ]

        # --- Chart 3: job status distribution --------------------------------
        job_status_series = [
            {"status": value, "label": label, "count": job_counts.get(value, 0)}
            for value, label in Job.Status.choices
        ]

        # --- Chart 4: department-wise hiring ---------------------------------
        # ``Job.objects`` already excludes soft-deleted jobs; also exclude
        # mappings to soft-deleted candidates so the count reflects live data.
        department_series = list(
            Job.objects.values("department")
            .annotate(
                jobs=Count("id", distinct=True),
                candidates=Count(
                    "candidate_mappings",
                    filter=Q(candidate_mappings__candidate__deleted_at__isnull=True),
                    distinct=True,
                ),
            )
            .order_by("-candidates", "department")
        )

        return Response(
            {
                "kpis": kpis,
                "charts": {
                    # Hiring Pipeline and Candidate Status both use per-status
                    # candidate counts (pipeline = ordered pipeline stages).
                    "hiring_pipeline": candidate_status_series,
                    "candidate_status": candidate_status_series,
                    "job_status": job_status_series,
                    "department_hiring": department_series,
                },
            }
        )


# ---------------------------------------------------------------------------
# Recycle Bin (soft delete) + Reset (clear all data)
# ---------------------------------------------------------------------------
class RecycleBinView(APIView):
    """
    GET /api/recycle-bin/

    Lists everything currently in the Recycle Bin — soft-deleted candidates and
    jobs — most-recently-deleted first. Each entry is restorable
    (POST /api/{candidates|jobs}/{id}/restore/) or permanently removable
    (DELETE /api/{candidates|jobs}/{id}/purge/).
    """

    def get(self, request):
        candidates = Candidate.all_objects.filter(deleted_at__isnull=False).order_by(
            "-deleted_at"
        )
        jobs = Job.all_objects.filter(deleted_at__isnull=False).order_by("-deleted_at")
        return Response(
            {
                "candidates": RecycleBinCandidateSerializer(candidates, many=True).data,
                "jobs": RecycleBinJobSerializer(jobs, many=True).data,
            }
        )


class ResetView(APIView):
    """
    POST /api/reset/

    Soft-deletes ALL live candidates and jobs at once (a fresh start). Everything
    moves to the Recycle Bin and stays restorable — nothing is erased. The user
    login, saved report configurations and the audit log are left untouched.

    Each soft-delete is recorded in the audit log by the existing save signal (a
    ``deleted_at`` UPDATE), so a reset is fully traceable and reversible. Returns
    the number of candidates and jobs moved to the bin.
    """

    def post(self, request):
        with transaction.atomic():
            candidates = list(Candidate.objects.all())
            jobs = list(Job.objects.all())
            for candidate in candidates:
                candidate.soft_delete()
            for job in jobs:
                job.soft_delete()
        return Response(
            {"candidates_removed": len(candidates), "jobs_removed": len(jobs)}
        )
