"""
Job-description field extraction (BRD Module 1 — paste JD -> structured fields).

Mirrors the resume-parsing design: a pluggable extractor with a Claude-backed
implementation and a regex/heuristic fallback that never raises, chosen by
``get_job_extractor()`` (Claude when ``ANTHROPIC_API_KEY`` is set, else heuristic).
The orchestration entry point ``parse_job_description(text)`` falls back from
Claude to the heuristic automatically on any Claude error, so it works with the
API key empty.

The normalized result (:class:`ParsedJobDescription`) carries exactly the fields
a Job create/edit form pre-fills from pasted text:

    location, number_of_openings, salary_min, salary_max, salary_currency
"""
from __future__ import annotations

import abc
import logging
import re
from dataclasses import dataclass
from typing import Optional

from django.conf import settings

from .extractor import (
    _CITY_KEYWORDS,
    _LOCATION_LABEL_RE,
    _MAX_TEXT_CHARS,
    _loads_json_object,
)

logger = logging.getLogger(__name__)


@dataclass
class ParsedJobDescription:
    """Normalized result of parsing a pasted job description (Module 1)."""

    location: str = ""
    number_of_openings: Optional[int] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    salary_currency: str = ""

    def as_response(self) -> dict:
        """Serialize to the parse_description endpoint's JSON shape (None for blanks)."""
        return {
            "location": self.location or None,
            "number_of_openings": self.number_of_openings,
            "salary_min": self.salary_min,
            "salary_max": self.salary_max,
            "salary_currency": self.salary_currency or None,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ParsedJobDescription":
        """Build from a loosely-typed dict (defensive; used for the Claude result)."""
        data = data or {}

        def _str(key: str) -> str:
            val = data.get(key)
            return val.strip() if isinstance(val, str) else ""

        def _int(key: str) -> Optional[int]:
            val = data.get(key)
            if isinstance(val, bool):
                return None
            if isinstance(val, (int, float)):
                return int(val)
            if isinstance(val, str):
                m = re.search(r"\d+", val.replace(",", ""))
                if m:
                    return int(m.group())
            return None

        def _num(key: str) -> Optional[float]:
            val = data.get(key)
            if isinstance(val, bool):
                return None
            if isinstance(val, (int, float)):
                return float(val)
            if isinstance(val, str):
                m = re.search(r"\d+(?:\.\d+)?", val.replace(",", ""))
                if m:
                    return float(m.group())
            return None

        currency = _str("salary_currency").upper()[:3]
        return cls(
            location=_str("location"),
            number_of_openings=_int("number_of_openings"),
            salary_min=_num("salary_min"),
            salary_max=_num("salary_max"),
            salary_currency=currency,
        )


class JobDescriptionExtractor(abc.ABC):
    """Pluggable job-description field extractor."""

    name: str = "base"

    @abc.abstractmethod
    def extract(self, text: str) -> ParsedJobDescription:
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Claude (Anthropic) extractor
# ---------------------------------------------------------------------------
_SYSTEM_PROMPT = (
    "You are an expert job-description parser for an HR recruitment portal. "
    "Extract structured fields from the job description text you are given. "
    "Respond with ONLY a single JSON object and no surrounding prose, "
    "markdown, or code fences."
)

_JSON_INSTRUCTIONS = """\
Extract the following fields from the job description text below and return a JSON
object with EXACTLY this shape (use null for anything not stated):

{
  "location": string|null,          // primary job location / city
  "number_of_openings": number|null,// count of positions / vacancies / openings
  "salary_min": number|null,        // lower bound of the salary/CTC range
  "salary_max": number|null,        // upper bound of the salary/CTC range
  "salary_currency": string|null    // ISO-ish code, e.g. "INR", "USD", "EUR"
}

Rules:
- Report salary numbers as plain numbers WITHOUT currency symbols or commas.
  Preserve the unit as written (e.g. "10-15 LPA" -> salary_min 10, salary_max 15;
  "Rs 12,00,000" -> 1200000). Do not convert between units.
- If a single salary figure is given, use it for both salary_min and salary_max.
- Infer salary_currency from symbols/words: ₹/Rs/INR/LPA -> "INR", $/USD -> "USD",
  €/EUR -> "EUR", £/GBP -> "GBP".
- Return only the JSON object.

JOB DESCRIPTION TEXT:
"""


class ClaudeJobDescriptionExtractor(JobDescriptionExtractor):
    """LLM-backed extractor using the Anthropic Messages API."""

    name = "claude"

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ):
        self.api_key = api_key or getattr(settings, "ANTHROPIC_API_KEY", "")
        self.model = model or getattr(
            settings, "ANTHROPIC_MODEL", "claude-haiku-4-5-20251001"
        )
        self.timeout = timeout or getattr(settings, "RESUME_PARSE_TIMEOUT", 10.0)
        self.max_tokens = max_tokens or getattr(
            settings, "RESUME_PARSE_MAX_TOKENS", 2048
        )

    def _client(self):
        # Import lazily so a missing SDK / key never breaks app startup.
        import anthropic

        return anthropic.Anthropic(api_key=self.api_key, timeout=self.timeout)

    def extract(self, text: str) -> ParsedJobDescription:
        if not self.api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not configured.")

        snippet = (text or "")[:_MAX_TEXT_CHARS]
        client = self._client()
        message = client.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": _JSON_INSTRUCTIONS + snippet}],
        )
        raw = "".join(
            block.text
            for block in message.content
            if getattr(block, "type", None) == "text"
        )
        data = _loads_json_object(raw)
        if data is None:
            raise ValueError("Claude did not return a parseable JSON object.")
        return ParsedJobDescription.from_dict(data)


# ---------------------------------------------------------------------------
# Heuristic (regex / rule-based) extractor
# ---------------------------------------------------------------------------
# "3 openings" / "2 positions" / "5 vacancies" (count precedes the noun) ...
_OPENINGS_BEFORE_RE = re.compile(
    r"(\d{1,4})\s*(?:\+\s*)?(?:openings?|positions?|vacanc(?:y|ies)|roles?|seats?|"
    r"headcounts?|hires?)\b",
    re.IGNORECASE,
)
# ... or "No. of openings: 3" / "Openings - 3" / "Vacancies: 3" (label first).
_OPENINGS_LABEL_RE = re.compile(
    r"(?:number|no\.?|#)?\s*of?\s*"
    r"(?:openings?|positions?|vacanc(?:y|ies)|roles?|headcounts?|hires?)\s*[:\-]?\s*(\d{1,4})",
    re.IGNORECASE,
)

# Currency detection from symbols / codes / words.
_CURRENCY_TOKENS = [
    (re.compile(r"₹|\bINR\b|\bRs\.?\b|\brupees?\b|\bLPA\b|\blakhs?\b|\bLacs?\b", re.IGNORECASE), "INR"),
    (re.compile(r"\$|\bUSD\b|\bdollars?\b", re.IGNORECASE), "USD"),
    (re.compile(r"€|\bEUR\b|\beuros?\b", re.IGNORECASE), "EUR"),
    (re.compile(r"£|\bGBP\b|\bpounds?\b", re.IGNORECASE), "GBP"),
]

# A salary amount like "12", "15.5", "10,00,000", "1.2L", "120k".
# The bare "l" (lakhs) uses a negative lookahead so it never swallows the "L" of
# "LPA": without it, "40 LPA" backtracks to "40 L" (×100,000 = 4,000,000) while
# a range like "10-15 LPA" stays 10/15 — an inconsistent 100,000× scaling bug.
_AMOUNT = r"\d[\d,]*(?:\.\d+)?\s*(?:lpa|lakhs?|lacs?|l(?!pa)|k|cr|crores?)?"
# Optional currency prefix that may sit before each amount ("$150,000", "₹10L").
_CUR_PREFIX = r"(?:[₹$€£]|Rs\.?|INR|USD|EUR|GBP)?\s*"
# A range "10 - 15 LPA" / "₹10,00,000 to ₹15,00,000" / "$120,000 - $150,000".
_SALARY_RANGE_RE = re.compile(
    _CUR_PREFIX + r"(" + _AMOUNT + r")\s*(?:-|–|—|to)\s*" + _CUR_PREFIX + r"(" + _AMOUNT + r")",
    re.IGNORECASE,
)
# A single figure that is tied to a currency symbol/code or a pay unit, so we do
# not mistake counts like "2 positions" for salary.
_SALARY_SINGLE_RE = re.compile(
    r"(?:[₹$€£]|Rs\.?|INR|USD|EUR|GBP)\s*(" + _AMOUNT + r")"
    r"|(" + _AMOUNT + r")\s*(?:lpa|lakhs?|lacs?|\bk\b|per\s+annum|p\.?a\.?)",
    re.IGNORECASE,
)
# A salary context line so we do not treat random numbers as pay.
_SALARY_CONTEXT_RE = re.compile(
    r"(?:salary|ctc|compensation|package|pay|remuneration|stipend|₹|\$|€|£|\bLPA\b|\bINR\b|\bUSD\b|\bRs\b)",
    re.IGNORECASE,
)


def _amount_to_number(token: str) -> Optional[float]:
    """Parse a salary token into a number, expanding L/k/Cr suffixes."""
    token = token.strip().lower()
    m = re.match(r"([\d,]+(?:\.\d+)?)\s*([a-z]*)", token)
    if not m:
        return None
    try:
        value = float(m.group(1).replace(",", ""))
    except ValueError:
        return None
    suffix = m.group(2)
    if suffix in ("k",):
        value *= 1_000
    elif suffix in ("l", "lakh", "lakhs", "lac", "lacs"):
        value *= 100_000
    elif suffix in ("cr", "crore", "crores"):
        value *= 10_000_000
    # "lpa" keeps the figure as-is (already expressed in LPA units).
    return value


class HeuristicJobDescriptionExtractor(JobDescriptionExtractor):
    """Regex / rule-based best-effort extractor. Never raises."""

    name = "heuristic"

    def extract(self, text: str) -> ParsedJobDescription:
        try:
            return self._extract(text or "")
        except Exception:  # never raise from the fallback path
            logger.exception("Heuristic job-description extraction failed unexpectedly.")
            return ParsedJobDescription()

    def _extract(self, text: str) -> ParsedJobDescription:
        text = text[:_MAX_TEXT_CHARS]
        return ParsedJobDescription(
            location=self._find_location(text),
            number_of_openings=self._find_openings(text),
            **self._find_salary(text),
        )

    @staticmethod
    def _find_location(text: str) -> str:
        m = _LOCATION_LABEL_RE.search(text)
        if m:
            # Split on sentence/clause boundaries too (. ;) — the label capture
            # allows periods, so "Location: Hyderabad. CTC Rs 12,00,000" would
            # otherwise return "Hyderabad. CTC Rs" instead of just "Hyderabad".
            value = re.split(r"[,.;\n|/]", m.group(1).strip(" .,-"))[0].strip()
            if 1 < len(value) <= 50:
                return value.title() if value.islower() else value
        lowered = text.lower()
        for city in _CITY_KEYWORDS:
            if re.search(r"(?<![\w])" + re.escape(city) + r"(?![\w])", lowered):
                return city.title()
        return ""

    @staticmethod
    def _find_openings(text: str) -> Optional[int]:
        for pattern in (_OPENINGS_LABEL_RE, _OPENINGS_BEFORE_RE):
            m = pattern.search(text)
            if m:
                try:
                    n = int(m.group(1))
                except ValueError:
                    continue
                if 0 < n <= 9999:
                    return n
        return None

    @staticmethod
    def _find_currency(text: str) -> str:
        for pattern, code in _CURRENCY_TOKENS:
            if pattern.search(text):
                return code
        return ""

    def _find_salary(self, text: str) -> dict:
        result = {"salary_min": None, "salary_max": None, "salary_currency": ""}
        # Prefer a range that sits near salary/CTC context to avoid false hits.
        for m in _SALARY_RANGE_RE.finditer(text):
            window = text[max(0, m.start() - 40): m.end() + 20]
            if not _SALARY_CONTEXT_RE.search(window):
                continue
            low = _amount_to_number(m.group(1))
            high = _amount_to_number(m.group(2))
            if low is not None and high is not None:
                if high < low:
                    low, high = high, low
                result["salary_min"] = low
                result["salary_max"] = high
                result["salary_currency"] = self._find_currency(window) or self._find_currency(text)
                return result
        # No range: try a single figure tied to a currency symbol or pay unit.
        for line in text.splitlines():
            if not _SALARY_CONTEXT_RE.search(line):
                continue
            m = _SALARY_SINGLE_RE.search(line)
            if not m:
                continue
            token = m.group(1) or m.group(2)
            amount = _amount_to_number(token) if token else None
            if amount and amount > 0:
                result["salary_min"] = amount
                result["salary_max"] = amount
                result["salary_currency"] = self._find_currency(line) or self._find_currency(text)
                return result
        result["salary_currency"] = self._find_currency(text)
        return result


# ---------------------------------------------------------------------------
# Factory + orchestration
# ---------------------------------------------------------------------------
def get_job_extractor() -> JobDescriptionExtractor:
    """Return Claude if an API key is set, else the heuristic extractor."""
    api_key = getattr(settings, "ANTHROPIC_API_KEY", "")
    if api_key:
        try:
            return ClaudeJobDescriptionExtractor(api_key=api_key)
        except Exception:  # pragma: no cover - constructor is trivial
            logger.exception(
                "Failed to construct ClaudeJobDescriptionExtractor; using heuristic."
            )
    return HeuristicJobDescriptionExtractor()


def parse_job_description(text: str) -> ParsedJobDescription:
    """Extract fields from pasted JD text; Claude with automatic heuristic fallback."""
    extractor = get_job_extractor()
    if isinstance(extractor, ClaudeJobDescriptionExtractor):
        try:
            return extractor.extract(text)
        except Exception:
            logger.warning(
                "Claude JD extractor failed; falling back to heuristic.", exc_info=True
            )
            return HeuristicJobDescriptionExtractor().extract(text)
    return extractor.extract(text)
