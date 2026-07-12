"""
Resume parsing pipeline (BRD Modules 2 & 3).

Public surface:

    extract_text(path, file_type) -> str          # core.parsing.extract
    ExtractionError                                # typed extraction failure

    ParsedResume                                   # normalized extraction result
    ResumeExtractor                                # pluggable interface
    ClaudeResumeExtractor / HeuristicResumeExtractor
    get_extractor()                                # factory (Claude if key else heuristic)

    parse_resume(resume) -> None                   # orchestration entry point

The pipeline is designed to run synchronously within the ~10s parse budget
(BRD §5 Performance): a single Claude call bounded by ``RESUME_PARSE_TIMEOUT``
with an automatic regex/heuristic fallback that never raises.
"""
from .extract import ExtractionError, extract_text
from .extractor import (
    ClaudeResumeExtractor,
    HeuristicResumeExtractor,
    ParsedResume,
    ResumeExtractor,
    get_extractor,
)
from .job_extractor import (
    ClaudeJobDescriptionExtractor,
    HeuristicJobDescriptionExtractor,
    JobDescriptionExtractor,
    ParsedJobDescription,
    get_job_extractor,
    parse_job_description,
)
from .service import parse_resume, parse_resume_preview

__all__ = [
    "ExtractionError",
    "extract_text",
    "ParsedResume",
    "ResumeExtractor",
    "ClaudeResumeExtractor",
    "HeuristicResumeExtractor",
    "get_extractor",
    "parse_resume",
    "parse_resume_preview",
    # Job-description parsing (Module 1)
    "ParsedJobDescription",
    "JobDescriptionExtractor",
    "ClaudeJobDescriptionExtractor",
    "HeuristicJobDescriptionExtractor",
    "get_job_extractor",
    "parse_job_description",
]
