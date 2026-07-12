"""
Field extraction behind a pluggable interface (BRD Module 3).

``ParsedResume`` is the normalized contract every extractor returns. Two
implementations are provided:

* :class:`ClaudeResumeExtractor` — uses the Anthropic SDK (model configurable via
  ``settings.ANTHROPIC_MODEL``) to return strict JSON matching the ParsedResume
  schema. The call is bounded by ``settings.RESUME_PARSE_TIMEOUT`` to respect the
  10s parse budget.
* :class:`HeuristicResumeExtractor` — regex/rule-based fallback that never raises
  and returns best-effort partial data. This is a faithful port of the reference
  app's ``parseResume`` (see ``reference/index (1).html``): merged-overlap
  experience totals with intern/trainee detection, employer-vs-title separation
  (COMPANY_RE / TITLE_RE), city-dictionary + address scanning for location, and
  education-section-scoped, longest-degree-first qualification detection.

``get_extractor()`` returns Claude when an API key is configured, else the
heuristic extractor. The orchestration layer (``service.parse_resume``) also
falls back to the heuristic extractor automatically if a Claude call fails.
"""
from __future__ import annotations

import abc
import datetime
import json
import logging
import re
from dataclasses import dataclass, field
from typing import Optional

from django.conf import settings

logger = logging.getLogger(__name__)

# Skill-type values mirror core.models.CandidateSkill.SkillType.
SKILL = "SKILL"
TECHNOLOGY = "TECHNOLOGY"
CERTIFICATION = "CERTIFICATION"
_VALID_SKILL_TYPES = {SKILL, TECHNOLOGY, CERTIFICATION}

# Cap the amount of resume text handed to the model / regex engine. Resumes
# rarely exceed a few pages; this keeps token usage and latency bounded.
_MAX_TEXT_CHARS = 16000


@dataclass
class ParsedResume:
    """Normalized result of parsing a resume (BRD Module 3 fields)."""

    full_name: str = ""
    email: str = ""
    mobile: str = ""
    address: str = ""
    current_location: str = ""
    total_experience_years: Optional[float] = None
    relevant_experience_years: Optional[float] = None
    current_company: str = ""
    current_designation: str = ""
    highest_qualification: str = ""
    # skills: list of {"name": str, "type": SKILL|TECHNOLOGY|CERTIFICATION}
    skills: list[dict] = field(default_factory=list)
    # experiences: list of {company, designation, start_date, end_date, is_current}
    experiences: list[dict] = field(default_factory=list)
    certifications: list[str] = field(default_factory=list)
    # parse_flags: keys of fields the extractor could NOT confidently extract
    # (e.g. "email", "phone", "name", "totalExp", "location", "currentCompany",
    # "currentDesignation", "qualification", "skills"). Drives the UI "verify"
    # badges. Populated by the heuristic extractor; empty for the Claude path.
    parse_flags: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict) -> "ParsedResume":
        """Build a ParsedResume from a loosely-typed dict (defensive)."""
        data = data or {}

        def _str(key: str) -> str:
            val = data.get(key)
            return val.strip() if isinstance(val, str) else ""

        def _num(key: str) -> Optional[float]:
            val = data.get(key)
            if isinstance(val, (int, float)):
                return float(val)
            if isinstance(val, str):
                m = re.search(r"\d+(?:\.\d+)?", val)
                if m:
                    return float(m.group())
            return None

        # --- skills / technologies / certifications ---
        skills: list[dict] = []
        seen: set[tuple[str, str]] = set()

        def _add_skill(name: str, stype: str) -> None:
            name = (name or "").strip()
            stype = stype if stype in _VALID_SKILL_TYPES else SKILL
            if not name:
                return
            key = (name.lower(), stype)
            if key in seen:
                return
            seen.add(key)
            skills.append({"name": name[:100], "type": stype})

        raw_skills = data.get("skills")
        if isinstance(raw_skills, list):
            for item in raw_skills:
                if isinstance(item, dict):
                    _add_skill(item.get("name", ""), str(item.get("type", SKILL)).upper())
                elif isinstance(item, str):
                    _add_skill(item, SKILL)
        # Some models emit a separate "technologies" array.
        raw_tech = data.get("technologies")
        if isinstance(raw_tech, list):
            for item in raw_tech:
                if isinstance(item, dict):
                    _add_skill(item.get("name", ""), TECHNOLOGY)
                elif isinstance(item, str):
                    _add_skill(item, TECHNOLOGY)

        certifications: list[str] = []
        raw_certs = data.get("certifications")
        if isinstance(raw_certs, list):
            for item in raw_certs:
                if isinstance(item, dict):
                    name = str(item.get("name", "")).strip()
                elif isinstance(item, str):
                    name = item.strip()
                else:
                    name = ""
                if name:
                    certifications.append(name[:100])

        # --- experiences ---
        experiences: list[dict] = []
        raw_exp = data.get("experiences") or data.get("experience")
        if isinstance(raw_exp, list):
            for item in raw_exp:
                if not isinstance(item, dict):
                    continue
                company = str(item.get("company", "") or "").strip()
                designation = str(
                    item.get("designation") or item.get("title") or ""
                ).strip()
                if not company and not designation:
                    continue
                experiences.append(
                    {
                        "company": company[:150],
                        "designation": designation[:150],
                        "start_date": item.get("start_date"),
                        "end_date": item.get("end_date"),
                        "is_current": bool(item.get("is_current", False)),
                    }
                )

        raw_flags = data.get("parse_flags")
        parse_flags = (
            [str(f) for f in raw_flags if isinstance(f, str)]
            if isinstance(raw_flags, list)
            else []
        )

        return cls(
            full_name=_str("full_name") or _str("name"),
            email=_str("email"),
            mobile=_str("mobile") or _str("phone") or _str("mobile_number"),
            address=_str("address"),
            current_location=_str("current_location") or _str("location"),
            total_experience_years=_num("total_experience_years"),
            relevant_experience_years=_num("relevant_experience_years"),
            current_company=_str("current_company"),
            current_designation=_str("current_designation") or _str("designation"),
            highest_qualification=_str("highest_qualification")
            or _str("education"),
            skills=skills,
            experiences=experiences,
            certifications=certifications,
            parse_flags=parse_flags,
        )


class ResumeExtractor(abc.ABC):
    """Pluggable resume field extractor."""

    name: str = "base"

    @abc.abstractmethod
    def extract(self, text: str) -> ParsedResume:
        """Return a :class:`ParsedResume` extracted from raw resume ``text``."""
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Claude (Anthropic) extractor
# ---------------------------------------------------------------------------
_SYSTEM_PROMPT = (
    "You are an expert resume parser for an HR recruitment portal. "
    "Extract structured candidate data from the resume text you are given. "
    "Respond with ONLY a single JSON object and no surrounding prose, "
    "markdown, or code fences."
)

_JSON_INSTRUCTIONS = """\
Extract the following fields from the resume text below and return a JSON object
with EXACTLY this shape (use "" for unknown strings, null for unknown numbers,
and [] for unknown lists):

{
  "full_name": string,
  "email": string,
  "mobile": string,               // include country code if present
  "address": string,
  "current_location": string,     // city/region the candidate is currently in
  "total_experience_years": number|null,
  "relevant_experience_years": number|null,
  "current_company": string,      // most recent / current employer
  "current_designation": string,  // most recent / current job title
  "highest_qualification": string,// e.g. "B.Tech Computer Science", "MBA"
  "skills": [ {"name": string, "type": "SKILL"} ],
  "technologies": [ {"name": string, "type": "TECHNOLOGY"} ],
  "certifications": [ string ],
  "experiences": [
    {
      "company": string,
      "designation": string,
      "start_date": string|null,  // "YYYY-MM-DD" or "YYYY-MM" or "YYYY"
      "end_date": string|null,    // null if ongoing
      "is_current": boolean
    }
  ]
}

Rules:
- "skills" are general/soft/professional skills; "technologies" are tools,
  languages, frameworks, and platforms. Put each item in the most appropriate
  list; do not duplicate an item across both lists.
- "current_company" is the candidate's EMPLOYER (a business/organization). NEVER
  put a school, college, or university name here — educational institutions
  belong only in "highest_qualification"/education. Likewise "current_designation"
  is a JOB title (e.g. "Senior Engineer"), never an academic degree.
- "highest_qualification" is the academic degree and field of study (e.g.
  "B.Tech, Computer Science" or "MBA, Finance"). NEVER put a company name or a
  job title here.
- "total_experience_years" is the total time the candidate has actually WORKED,
  computed from their employment date ranges: merge overlapping periods and do
  NOT count the same time twice; do NOT count years spent in education. If the
  resume states a total explicitly, prefer that stated figure.
  "relevant_experience_years" is the portion relevant to their core field
  (exclude internships and unrelated roles); it may equal total when unclear and
  must never exceed total_experience_years.
- Return only the JSON object.

RESUME TEXT:
"""


class ClaudeResumeExtractor(ResumeExtractor):
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

    def extract(self, text: str) -> ParsedResume:
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
        return ParsedResume.from_dict(data)


def _loads_json_object(raw: str) -> Optional[dict]:
    """Defensively parse the first JSON object out of a model response."""
    if not raw:
        return None
    raw = raw.strip()
    # Strip ```json ... ``` fences if the model added them.
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw).strip()
    try:
        obj = json.loads(raw)
        return obj if isinstance(obj, dict) else None
    except (json.JSONDecodeError, TypeError):
        pass
    # Fall back to the outermost {...} span.
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            obj = json.loads(raw[start : end + 1])
            return obj if isinstance(obj, dict) else None
        except json.JSONDecodeError:
            return None
    return None


# ===========================================================================
# Heuristic (regex / rule-based) extractor — ported from the reference app.
# ===========================================================================

# --- Contact -----------------------------------------------------------------
_EMAIL_RE = re.compile(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", re.IGNORECASE)
# Phone: tried in order (reference parseResume) — 5+5, 3-3-4, then bare 10 digits.
_PHONE_RES = [
    re.compile(r"(?:\+?\d{1,3}[\s-]?)?(?:\(\d{2,4}\)[\s-]?)?\d{5}[\s-]?\d{5}"),
    re.compile(r"(?:\+?\d{1,3}[\s-]?)?\d{3}[\s-]\d{3}[\s-]\d{4}"),
    re.compile(r"\b\d{10}\b"),
]

# --- Skills dictionary (reference SKILL_DICT + LANG split) -------------------
# Languages are classified as SKILL; everything else as TECHNOLOGY (reference).
_SKILL_DICT = [
    "Java", "Python", "JavaScript", "TypeScript", "C++", "C#", ".NET", "Go", "Rust",
    "Ruby", "PHP", "Kotlin", "Swift", "Scala", "SQL", "PL/SQL",
    "React", "Angular", "Vue", "Next.js", "Node.js", "Express", "Spring",
    "Spring Boot", "Hibernate", "Django", "Flask", "FastAPI", "Laravel", "Rails",
    "Redux", "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "Jenkins",
    "Git", "GitHub", "GitLab", "CI/CD", "Ansible", "Linux", "GitHub Actions",
    "MySQL", "PostgreSQL", "MongoDB", "Redis", "Oracle", "Cassandra",
    "Elasticsearch", "Snowflake", "Kafka", "RabbitMQ",
    "Salesforce", "Apex", "Lightning", "SAP", "ServiceNow", "Workday", "Tableau",
    "Power BI", "Excel",
    "Machine Learning", "Deep Learning", "TensorFlow", "PyTorch", "NLP",
    "LangGraph", "RAG", "LLM", "Pandas", "NumPy", "Spark", "Hadoop", "Airflow",
    "dbt", "ETL",
    "HTML", "CSS", "SASS", "Tailwind", "GraphQL", "REST", "Microservices", "Agile",
    "Scrum", "JIRA", "Selenium", "Cypress", "JUnit", "TestNG", "Jest",
    "Figma", "Photoshop", "Illustrator", "Android", "iOS", "Flutter",
    "React Native", "JWT", "S3", "EC2",
]
_LANG_SET = {
    "Java", "Python", "JavaScript", "TypeScript", "C++", "C#", "Go", "Rust", "Ruby",
    "PHP", "Kotlin", "Swift", "Scala", "SQL", "PL/SQL", "HTML", "CSS", "Apex",
}

# --- Cities / states (reference CITY_DICT + STATE_RE) ------------------------
_CITY_DICT = [
    "Bengaluru", "Bangalore", "Hyderabad", "Chennai", "Navi Mumbai", "Mumbai",
    "Thane", "Pune", "New Delhi", "Delhi", "Noida", "Gurugram", "Gurgaon",
    "Kolkata", "Ahmedabad", "Jaipur", "Kochi", "Cochin", "Coimbatore", "Indore",
    "Chandigarh", "Thiruvananthapuram", "Trivandrum", "Nagpur", "Visakhapatnam",
    "Vizag", "Lucknow", "Bhopal", "Surat", "Vadodara", "Mysuru", "Mysore",
    "Belagavi", "Belgaum", "Hubli", "Hubballi", "Dharwad", "Mangaluru",
    "Mangalore", "Udupi", "Manipal", "Nashik", "Aurangabad", "Kanpur", "Patna",
    "Ranchi", "Bhubaneswar", "Guwahati", "Raipur", "Ludhiana", "Amritsar",
    "Dehradun", "Panaji", "Goa", "Tiruchirappalli", "Trichy", "Madurai", "Salem",
    "Erode", "Tirupati", "Vijayawada", "Guntur", "Warangal", "Rajkot",
    "Bhavnagar", "Faridabad", "Ghaziabad", "Meerut", "Agra", "Varanasi",
    "Prayagraj", "Allahabad", "Jodhpur", "Udaipur", "Kota", "Shimla", "Srinagar",
    "Jammu", "Puducherry", "Pondicherry", "Remote", "Hybrid",
    "London", "New York", "San Francisco", "Seattle", "Austin", "Toronto",
    "Singapore", "Dubai", "Berlin", "Sydney",
]
_STATE_RE = re.compile(
    r"^(karnataka|maharashtra|tamil\s*nadu|kerala|telangana|andhra\s*pradesh|"
    r"gujarat|rajasthan|punjab|haryana|uttar\s*pradesh|madhya\s*pradesh|bihar|"
    r"west\s*bengal|odisha|orissa|assam|jharkhand|chhattisgarh|uttarakhand|"
    r"himachal\s*pradesh|goa|jammu\s*(and|&)\s*kashmir|delhi|ncr|india)$",
    re.IGNORECASE,
)

# Backwards-compatibility aliases used by core.parsing.job_extractor.
_CITY_KEYWORDS = [c.lower() for c in _CITY_DICT]
_LOCATION_LABEL_RE = re.compile(
    r"(?:current\s+location|location|based\s+(?:in|at)|city)\s*[:\-]\s*"
    r"([A-Za-z][A-Za-z .'\-]{1,48})",
    re.IGNORECASE,
)

# --- Degrees (reference DEGREES; matched longest-first, digit-safe) ----------
_DEGREES = [
    "Ph.D", "PhD", "M.Tech", "MTech", "M.E", "M.S", "MS", "M.Sc", "MSc", "MCA",
    "MBA", "B.Tech", "BTech", "B.E", "BE", "B.Sc", "BSc", "BCA", "B.Com", "BA",
    "Diploma",
]

# --- Months (reference MONTHS; 0-based to match toIdx = y*12 + m) ------------
_MONTHS = {
    "jan": 0, "january": 0, "feb": 1, "february": 1, "mar": 2, "march": 2,
    "apr": 3, "april": 3, "may": 4, "jun": 5, "june": 5, "jul": 6, "july": 6,
    "aug": 7, "august": 7, "sep": 8, "sept": 8, "september": 8, "oct": 9,
    "october": 9, "nov": 10, "november": 10, "dec": 11, "december": 11,
}
_MN = "|".join(_MONTHS.keys())

# Date ranges — "Nov 2024 - Present", "Feb 2022 – Nov 2024" (reference RANGE_RE),
# and numeric "11/2024 - present" (reference RANGE_NUM_RE).
_RANGE_RE = re.compile(
    r"(" + _MN + r")\.?\s*'?(\d{4})"
    r"\s*(?:–|—|-|to|until|through)\s*"
    r"(present|current|till\s*date|now|(" + _MN + r")\.?\s*'?(\d{4}))",
    re.IGNORECASE,
)
_RANGE_NUM_RE = re.compile(
    r"(\d{1,2})[/\-](\d{4})\s*(?:–|—|-|to)\s*"
    r"(present|current|now|(\d{1,2})[/\-](\d{4}))",
    re.IGNORECASE,
)

# Company vs. title discriminators (reference COMPANY_RE / TITLE_RE).
_COMPANY_RE = re.compile(
    r"\b(pvt\.?|private|ltd\.?|limited|llp|inc\.?|llc|corp\.?|corporation|"
    r"technologies|technology|technolabs|infotech|systems|solutions|consulting|"
    r"consultancy|labs|enterprises|industries|manpower|associates|holdings|"
    r"ventures|group|company|co\.)\b",
    re.IGNORECASE,
)
_TITLE_RE = re.compile(
    r"\b(engineer|developer|manager|analyst|architect|designer|scientist|"
    r"consultant|specialist|administrator|lead|director|officer|executive|"
    r"associate|accountant|recruiter|technician|programmer|tester|sde|swe|sre|"
    r"devops|qa|product\s+owner|scrum\s+master|coordinator|supervisor|strategist|"
    r"writer|editor|intern|trainee|head\s+of|principal|nurse|therapist|counsel|"
    r"attorney|advocate)\b",
    re.IGNORECASE,
)
_INTERN_RE = re.compile(r"\bintern(ship)?\b|\btrainee\b", re.IGNORECASE)

# --- Section slicing (reference HEAD_EXP / HEAD_EDU / HEAD_OTHER) ------------
_HEAD_EXP = re.compile(
    r"^\s*(professional\s+experience|work\s+experience|employment(\s+history)?|"
    r"experience|career\s+history)\s*:?\s*$",
    re.IGNORECASE,
)
_HEAD_EDU = re.compile(
    r"^\s*(education|academics?|academic\s+background|qualifications?|"
    r"educational\s+qualifications?)\s*:?\s*$",
    re.IGNORECASE,
)
_HEAD_OTHER = re.compile(
    r"^\s*(education|academic|key\s+projects?|projects?|skills?|technical\s+skills|"
    r"certifications?|achievements?|awards?|summary|objective|profile|"
    r"publications?|interests?|languages?|references?)\b.{0,30}$",
    re.IGNORECASE,
)

# --- Address heuristics (reference EDU_RE / NOISE_RE / ADDR_TOKEN / …) -------
_EDU_RE = re.compile(
    r"universit|college|school|institute|academy|b\.?\s?tech|m\.?\s?tech|bachelor|"
    r"master|degree|cgpa|gpa|percentage|\bclass\b|board|graduat",
    re.IGNORECASE,
)
_NOISE_RE = re.compile(r"@|https?:|linkedin|github|portfolio|www\.", re.IGNORECASE)
_PIN_RE = re.compile(r"\b\d{6}\b")
_ADDR_TOKEN = re.compile(
    r"\b(road|rd|street|st|nagar|sector|colony|apartment|apt|flat|block|layout|"
    r"lane|cross|avenue|marg|phase|pin|pincode|near|opp|society|tower|towers|"
    r"floor|extension|enclave|vihar|puram|halli|pura)\b",
    re.IGNORECASE,
)
_ADDR_PROSE = re.compile(
    r"[.!?]\s*$|\b(based|experience|engineer|developer|analyst|manager|working|"
    r"passionate|skilled|seeking|summary|objective|profile|years?)\b",
    re.IGNORECASE,
)
_ADDR_LABEL_RE = re.compile(r"^\s*address\s*[:\-–]\s*(.+)$", re.IGNORECASE | re.MULTILINE)

# Stated experience phrases (reference parseResume overrides).
_TOTAL_EXP_RE = re.compile(
    r"(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:total\s*)?(?:it\s*)?experience",
    re.IGNORECASE,
)
_RELEVANT_EXP_RES = [
    re.compile(r"relevant\s*experience\s*[:\-–]?\s*(\d{1,2}(?:\.\d)?)", re.IGNORECASE),
    re.compile(r"(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years?|yrs?)\s*(?:of\s*)?relevant", re.IGNORECASE),
]
# Explicit current-company / current-designation phrases.
_CUR_COMPANY_RE = re.compile(
    r"(?:currently\s+(?:working\s+)?(?:at|with)|current\s+company)\s*[:\-–]?\s*"
    r"([A-Z][A-Za-z0-9&.,'\- ]{2,40})"
)
_CUR_DESIGNATION_RE = re.compile(
    r"(?:current\s+(?:designation|role|title)|designation)\s*[:\-–]?\s*"
    r"([A-Za-z0-9/&.\- ]{3,45})",
    re.IGNORECASE,
)
_NAME_SKIP_RE = re.compile(r"@|\d{5}|resume|curriculum|vitae|linkedin|github|http", re.IGNORECASE)
_NAME_OK_RE = re.compile(r"^[A-Za-z][A-Za-z.'\- ]+$")
_CERT_RE = re.compile(r"certifi(?:ed|cation)[^\n]{0,80}", re.IGNORECASE)


def _city_in(s: str) -> str:
    """Return the first CITY_DICT city occurring in ``s`` (word-bounded), else ''."""
    if not s:
        return ""
    for c in _CITY_DICT:
        pat = re.escape(c).replace(r"\ ", " ")
        if re.search(r"(^|[^A-Za-z])" + pat + r"([^A-Za-z]|$)", s, re.IGNORECASE):
            return c
    return ""


def _derive_location(address: str) -> str:
    """"Belgaum, Karnataka" -> "Belgaum"; "12 MG Road, …, Bengaluru 560038" -> "Bengaluru"."""
    if not address:
        return ""
    hit = _city_in(address)
    if hit:
        return hit
    parts = [p.strip() for p in address.split(",")]
    parts = [re.sub(r"\b\d{6}\b", "", p).strip() for p in parts if p.strip()]
    parts = [p for p in parts if p and not _STATE_RE.match(p)]
    last = parts[-1] if parts else ""
    return last if len(last.split()) <= 3 else ""


def _yrs(months: int) -> float:
    return round(months / 12.0, 1)


class HeuristicResumeExtractor(ResumeExtractor):
    """Regex / rule-based best-effort extractor. Never raises.

    Faithful port of the reference app's ``parseResume`` — see the module
    docstring. Returns a fully-populated :class:`ParsedResume`, including
    ``parse_flags`` naming every field it could not confidently extract.
    """

    name = "heuristic"

    def extract(self, text: str) -> ParsedResume:
        try:
            return self._extract(text or "")
        except Exception:  # never raise from the fallback path
            logger.exception("Heuristic resume extraction failed unexpectedly.")
            return ParsedResume(parse_flags=["parse_error"])

    def _extract(self, text: str) -> ParsedResume:
        text = text[:_MAX_TEXT_CHARS].replace("\r", "")
        raw_lines = [ln.strip() for ln in text.split("\n")]
        lines = [ln for ln in raw_lines if ln]
        flat = re.sub(r"\s+", " ", text)
        low = flat.lower()
        flags: list[str] = []

        # --- email / phone ---------------------------------------------------
        m = _EMAIL_RE.search(text)
        email = m.group(0) if m else ""
        if not email:
            flags.append("email")

        phone = ""
        for pat in _PHONE_RES:
            m = pat.search(text)
            if m:
                phone = m.group(0).strip()
                break
        if not phone:
            flags.append("phone")

        # --- name ------------------------------------------------------------
        name = ""
        for ln in lines[:8]:
            if _NAME_SKIP_RE.search(ln):
                continue
            words = ln.split()
            if 2 <= len(words) <= 4 and _NAME_OK_RE.match(ln):
                name = re.sub(r"\s+", " ", ln)
                break
        if not name and lines:
            name = lines[0][:60]
        if not name:
            flags.append("name")

        # --- experience (merged-overlap total + intern-aware relevant) -------
        exp = self._extract_experience(text)
        total_exp = exp["total"]
        relevant_exp = exp["relevant"]

        em = _TOTAL_EXP_RE.search(low)
        if em:
            total_exp = float(em.group(1))
        for pat in _RELEVANT_EXP_RES:
            rm = pat.search(low)
            if rm:
                relevant_exp = float(rm.group(1))
                break

        if total_exp is None:
            flags.append("totalExp")
        if relevant_exp is None:
            flags.append("relevantExp")

        # --- location / address ---------------------------------------------
        address, location = self._extract_address(text)
        if not location and address:
            location = _derive_location(address)
        if not address and location:
            address = location
        if not address:
            flags.append("address")
        if not location:
            flags.append("location")

        # --- skills / technologies ------------------------------------------
        found = [
            s for s in _SKILL_DICT
            if re.search(
                r"(^|[^A-Za-z])" + re.escape(s) + r"([^A-Za-z]|$)", flat, re.IGNORECASE
            )
        ]
        skills = [{"name": s, "type": SKILL} for s in found if s in _LANG_SET]
        skills += [{"name": s, "type": TECHNOLOGY} for s in found if s not in _LANG_SET]
        if not found:
            flags.append("skills")

        # --- current employer (ongoing stint, else the largest) -------------
        current_company = ""
        current_designation = ""
        stints = exp["stints"]
        latest = next((s for s in stints if s["ongoing"]), stints[0] if stints else None)
        if latest:
            current_designation = latest["designation"] or ""
            current_company = latest["company"] or ""
        cm = _CUR_COMPANY_RE.search(flat)
        if cm:
            current_company = cm.group(1).strip()
        dm = _CUR_DESIGNATION_RE.search(flat)
        if dm:
            current_designation = dm.group(1).strip()
        if not current_company:
            flags.append("currentCompany")
        if not current_designation:
            flags.append("currentDesignation")

        # --- qualification (education section; longest degree first) ---------
        edu_lines = self._slice_education(raw_lines)
        edu_text = re.sub(r"\s+", " ", " ".join(edu_lines) or flat)
        qualification = ""
        for d in sorted(_DEGREES, key=len, reverse=True):
            pat = re.escape(d)
            if re.search(
                r"(^|[^A-Za-z0-9.])" + pat + r"([^A-Za-z0-9]|$)", edu_text, re.IGNORECASE
            ):
                qualification = d
                break
        if not qualification:
            flags.append("qualification")

        # --- certifications (cap 4) -----------------------------------------
        certifications = []
        for cline in _CERT_RE.findall(text):
            cline = cline.strip()
            # Skip a bare "Certifications"/"Certified" section header (no real cert).
            if re.fullmatch(r"certifications?|certified", cline, re.IGNORECASE):
                continue
            certifications.append(cline)
            if len(certifications) >= 4:
                break

        return ParsedResume(
            full_name=name,
            email=email,
            mobile=phone,
            address=address,
            current_location=location,
            total_experience_years=total_exp,
            relevant_experience_years=relevant_exp,
            current_company=current_company,
            current_designation=current_designation,
            highest_qualification=qualification,
            skills=skills,
            experiences=exp["experiences"],
            certifications=certifications,
            parse_flags=flags,
        )

    # -- experience --------------------------------------------------------
    def _extract_experience(self, text: str) -> dict:
        """Port of the reference ``extractExperience``.

        Returns ``{total, relevant, stints, experiences}``:
        * ``total`` — merged-overlap months of ALL stints, in years (None when none).
        * ``relevant`` — merged-overlap months of NON-intern stints (falls back to
          ``total`` when every stint is an internship/trainee).
        * ``stints`` — display rows sorted by duration desc.
        * ``experiences`` — CandidateExperience-shaped dicts for persistence.
        """
        raw_lines = [ln.strip() for ln in text.split("\n")]
        sec = self._slice_experience(raw_lines)
        if not sec:
            sec = raw_lines
        ranges = self._parse_ranges(sec)
        if not ranges:
            return {"total": None, "relevant": None, "stints": [], "experiences": []}

        total = _yrs(self._merged_months(ranges))
        non_intern = [r for r in ranges if not r["intern"]]
        relevant = _yrs(self._merged_months(non_intern)) if non_intern else total

        stints = sorted(
            (
                {
                    "title": r["title"],
                    "designation": r["designation"],
                    "company": r["company"],
                    "months": r["b"] - r["a"] + 1,
                    "intern": r["intern"],
                    "ongoing": r["ongoing"],
                }
                for r in ranges
            ),
            key=lambda s: s["months"],
            reverse=True,
        )

        experiences = []
        for r in ranges:
            company = (r["company"] or "").strip()[:150]
            designation = (r["designation"] or "").strip()[:150]
            if not company and not designation:
                # Keep something searchable when the split produced neither.
                designation = (r["title"] or "").strip()[:150]
            if not company and not designation:
                continue
            experiences.append(
                {
                    "company": company,
                    "designation": designation,
                    "start_date": self._idx_to_month(r["a"]),
                    "end_date": None if r["ongoing"] else self._idx_to_month(r["b"]),
                    "is_current": r["ongoing"],
                }
            )
        return {
            "total": total,
            "relevant": relevant,
            "stints": stints,
            "experiences": experiences,
        }

    def _parse_ranges(self, lines: list[str]) -> list[dict]:
        out: list[dict] = []
        today = datetime.date.today()
        today_idx = today.year * 12 + (today.month - 1)
        for i, line in enumerate(lines):
            matched = None
            a = b = None
            m = _RANGE_RE.search(line)
            if m:
                matched = m.group(0)
                a = int(m.group(2)) * 12 + _MONTHS[m.group(1).lower()]
                end_whole = m.group(3)
                if re.search(r"present|current|till|now", end_whole, re.IGNORECASE):
                    b = None
                else:
                    b = int(m.group(5)) * 12 + _MONTHS[m.group(4).lower()]
            else:
                m = _RANGE_NUM_RE.search(line)
                if not m:
                    continue
                matched = m.group(0)
                a = int(m.group(2)) * 12 + (int(m.group(1)) - 1)
                end_whole = m.group(3)
                if re.search(r"present|current|now", end_whole, re.IGNORECASE):
                    b = None
                else:
                    b = int(m.group(5)) * 12 + (int(m.group(4)) - 1)

            end = today_idx if b is None else b
            if end < a:
                continue

            stripped = re.sub(r"[—–\-|,]+\s*$", "", line.replace(matched, "", 1)).strip()
            prev = self._nearby(lines, i, -1)
            nxt = self._nearby(lines, i, 1)
            designation, company = self._split_role_company([stripped, prev, nxt])

            if designation and company:
                title = f"{designation} — {company}"
            elif len(stripped) > 2:
                title = stripped
            else:
                title = designation or company or prev or "Role"

            intern = bool(_INTERN_RE.search(" ".join([stripped, prev, designation])))
            out.append(
                {
                    "a": a,
                    "b": end,
                    "ongoing": b is None,
                    "title": title[:90],
                    "designation": designation,
                    "company": company,
                    "intern": intern,
                }
            )
        return out

    @staticmethod
    def _merged_months(ranges: list[dict]) -> int:
        """Union overlapping [a, b] intervals and sum their length (reference mergedMonths)."""
        if not ranges:
            return 0
        spans = sorted(([r["a"], r["b"] + 1] for r in ranges), key=lambda x: x[0])
        total = 0
        cs, ce = spans[0]
        for s, e in spans[1:]:
            if s <= ce:
                ce = max(ce, e)
            else:
                total += ce - cs
                cs, ce = s, e
        return total + (ce - cs)

    @staticmethod
    def _split_role_company(candidates: list[str]) -> tuple[str, str]:
        """Work out which token is the job title and which is the employer."""
        tokens: list[str] = []
        for s in candidates:
            if not s:
                continue
            for x in re.split(r"\s+[—–|]\s+|\s{2,}|\s+at\s+|,\s*", s, flags=re.IGNORECASE):
                x = re.sub(r"[.,;]$", "", x.strip())
                if 1 < len(x) < 60:
                    tokens.append(x)
        designation = next(
            (t for t in tokens if _TITLE_RE.search(t) and not _COMPANY_RE.search(t)), ""
        )
        company = next(
            (t for t in tokens if t != designation and _COMPANY_RE.search(t)), ""
        )
        if not company:
            company = next(
                (
                    t
                    for t in tokens
                    if t != designation and re.match(r"^[A-Z]", t) and len(t.split()) <= 5
                ),
                "",
            )
        return designation, company

    @staticmethod
    def _nearby(lines: list[str], i: int, direction: int) -> str:
        k = i + direction
        while 0 <= k < len(lines) and abs(k - i) <= 3:
            l = (lines[k] or "").strip()
            if len(l) > 2 and not re.match(r"^[•·\-*]", l):
                return l
            k += direction
        return ""

    @staticmethod
    def _idx_to_month(idx: int) -> str:
        year, month = divmod(idx, 12)
        return f"{year:04d}-{month + 1:02d}"

    # -- section slicing ---------------------------------------------------
    @staticmethod
    def _slice_at(lines: list[str], head_re: re.Pattern) -> list[str]:
        start = next((i for i, l in enumerate(lines) if head_re.match(l)), -1)
        if start < 0:
            return []
        end = len(lines)
        for i in range(start + 1, len(lines)):
            if _HEAD_OTHER.match(lines[i]) or _HEAD_EXP.match(lines[i]):
                end = i
                break
        return lines[start + 1 : end]

    def _slice_experience(self, lines: list[str]) -> list[str]:
        return self._slice_at(lines, _HEAD_EXP)

    def _slice_education(self, lines: list[str]) -> list[str]:
        return self._slice_at(lines, _HEAD_EDU)

    # -- address -----------------------------------------------------------
    def _extract_address(self, text: str) -> tuple[str, str]:
        lines = [ln.strip() for ln in text.split("\n") if ln.strip()]

        labelled = _ADDR_LABEL_RE.search(text)
        if labelled:
            value = labelled.group(1).strip()[:150]
            return value, _city_in(labelled.group(1))

        def scan(arr: list[str]) -> str:
            for l in arr:
                if _EDU_RE.search(l) or _NOISE_RE.search(l):
                    continue
                if len(l) > 130 or len(l) < 3:
                    continue
                if _ADDR_PROSE.search(l):  # a sentence, not an address
                    continue
                if len(l.split()) > 14:
                    continue

                city = _city_in(l)
                looks_like_address = (
                    bool(_PIN_RE.search(l))
                    or bool(_ADDR_TOKEN.search(l))
                    or (city and "," in l)
                    or (city and len(l.split()) <= 4)
                )
                if not looks_like_address:
                    continue

                clean = re.sub(r"^[•·|\-–—\s]+", "", l)
                clean = re.sub(r"(\+?\d[\d\s\-()]{7,})", "", clean)
                clean = re.sub(r"\s*[|•·]\s*", ", ", clean)
                clean = re.sub(r",\s*,", ",", clean)
                clean = re.sub(r"^,\s*|,\s*$", "", clean).strip()
                if len(clean) >= 3:
                    return clean
            return ""

        head = scan(lines[:12])
        addr = head or scan(lines[-12:])
        location = _city_in(addr) or _city_in(" ".join(lines[:10]))
        return addr, location


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------
def get_extractor() -> ResumeExtractor:
    """Return the configured extractor: Claude if an API key is set, else heuristic."""
    api_key = getattr(settings, "ANTHROPIC_API_KEY", "")
    if api_key:
        try:
            return ClaudeResumeExtractor(api_key=api_key)
        except Exception:  # pragma: no cover - constructor is trivial
            logger.exception("Failed to construct ClaudeResumeExtractor; using heuristic.")
    return HeuristicResumeExtractor()
