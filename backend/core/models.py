"""
HireTrack data model.

Implements the 13 entities from the BRD (Section 7) with a normalized,
indexed schema designed to scale to 1M+ resumes with sub-2s global search.

Entity map (BRD name -> model):
    User                 -> django.contrib.auth.User (+ Profile)
    Job                  -> Job
    Job Description      -> JobDescription      (OneToOne detail of Job)
    Candidate            -> Candidate
    Resume               -> Resume
    Candidate Skills     -> CandidateSkill
    Candidate Experience -> CandidateExperience
    Candidate Job Mapping-> CandidateJobMapping
    Interview            -> Interview
    Offer                -> Offer
    Recruitment Status   -> RecruitmentStatus   (status-transition history)
    Report Configuration -> ReportConfiguration
    Audit Log            -> AuditLog

See SCHEMA.md for the full design rationale (Job vs JobDescription split,
RecruitmentStatus role, indexing/FTS strategy, audit logging).
"""
from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.search import SearchVectorField
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


# ---------------------------------------------------------------------------
# Abstract base
# ---------------------------------------------------------------------------
class TimeStampedModel(models.Model):
    """Adds created/updated timestamps to every concrete model."""

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


# ---------------------------------------------------------------------------
# User profile (lightweight; single-user portal, room for prefs later)
# ---------------------------------------------------------------------------
class Profile(TimeStampedModel):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    display_name = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    # Notification channel preferences (Module 10), stored as a flexible map.
    notification_prefs = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return self.display_name or self.user.get_username()


# ---------------------------------------------------------------------------
# Module 1 & 6 — Job / Job Description
# ---------------------------------------------------------------------------
class Job(TimeStampedModel):
    """A hiring requisition / opening (Module 1 structured fields, Module 6 status)."""

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        CLOSED = "CLOSED", "Closed"
        ON_HOLD = "ON_HOLD", "On Hold"

    class EmploymentType(models.TextChoices):
        FULL_TIME = "FULL_TIME", "Full Time"
        PART_TIME = "PART_TIME", "Part Time"
        CONTRACT = "CONTRACT", "Contract"
        INTERNSHIP = "INTERNSHIP", "Internship"
        TEMPORARY = "TEMPORARY", "Temporary"

    # Human-readable, auto-generated identifier (e.g. JOB-000123).
    job_id = models.CharField(max_length=20, unique=True, editable=False, db_index=True)

    job_role = models.CharField(max_length=150, db_index=True)
    department = models.CharField(max_length=120, db_index=True)
    hiring_manager = models.CharField(max_length=150, blank=True)

    # Experience required, expressed as a year range.
    experience_min_years = models.DecimalField(
        max_digits=4, decimal_places=1, default=0
    )
    experience_max_years = models.DecimalField(
        max_digits=4, decimal_places=1, null=True, blank=True
    )

    location = models.CharField(max_length=150, db_index=True)
    employment_type = models.CharField(
        max_length=20,
        choices=EmploymentType.choices,
        default=EmploymentType.FULL_TIME,
    )
    number_of_openings = models.PositiveIntegerField(default=1)

    # Salary range.
    salary_min = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    salary_max = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    salary_currency = models.CharField(max_length=3, default="INR")

    job_status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.OPEN,
        db_index=True,
    )
    is_archived = models.BooleanField(default=False, db_index=True)
    # Set automatically when job_status becomes CLOSED (cleared when reopened);
    # drives the "Roles/Openings closed" columns of the openings report (Module 8).
    closed_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["job_status", "is_archived"], name="job_status_arch_idx"),
            models.Index(fields=["department", "job_status"], name="job_dept_status_idx"),
        ]

    def __str__(self):
        return f"{self.job_id} — {self.job_role}"

    @property
    def is_open_for_mapping(self):
        """Closed jobs cannot accept new candidate mappings (User Story 2)."""
        return self.job_status != self.Status.CLOSED and not self.is_archived

    def save(self, *args, **kwargs):
        # Maintain closed_at from job_status: stamp it on close, clear on reopen.
        # Idempotent (does not overwrite an existing close timestamp), so editing a
        # closed job keeps its original closed date.
        if self.job_status == self.Status.CLOSED:
            if self.closed_at is None:
                self.closed_at = timezone.now()
        elif self.closed_at is not None:
            self.closed_at = None
        creating = self._state.adding
        super().save(*args, **kwargs)
        # Derive the human-readable Job ID from the primary key after first save.
        if creating and not self.job_id:
            self.job_id = f"JOB-{self.pk:06d}"
            super().save(update_fields=["job_id"])


class JobDescription(TimeStampedModel):
    """
    Descriptive / narrative detail for a Job.

    Design: heavy free-text lives here, one-to-one with Job, so the frequently
    scanned/filtered structured columns on Job stay compact and fast.
    """

    job = models.OneToOneField(
        Job, on_delete=models.CASCADE, related_name="description"
    )
    summary = models.TextField(blank=True)
    responsibilities = models.TextField(blank=True)
    required_skills = models.TextField(
        blank=True, help_text="Free-text / comma-separated required skills."
    )
    qualifications = models.TextField(blank=True)
    benefits = models.TextField(blank=True)

    def __str__(self):
        return f"JD for {self.job.job_id}"


# ---------------------------------------------------------------------------
# Modules 3 & 5 — Candidate
# ---------------------------------------------------------------------------
class Candidate(TimeStampedModel):
    """
    A candidate profile. Personal/experience/skills/employment fields are
    populated by resume parsing; the salary/notice/status fields are edited by
    the HR user (Module 5).
    """

    class Status(models.TextChoices):
        # Values chosen for stability; labels match the BRD dropdown exactly.
        RESUME_RECEIVED = "RESUME_RECEIVED", "Resume Received"
        SHORTLISTED = "SHORTLISTED", "Shortlisted"
        INTERVIEW_SCHEDULED = "INTERVIEW_SCHEDULED", "Interview Scheduled"
        INTERVIEW_IN_PROGRESS = "INTERVIEW_IN_PROGRESS", "Interview In Progress"
        INTERVIEW_COMPLETED = "INTERVIEW_COMPLETED", "Interview Completed"
        OFFER_RELEASED = "OFFER_RELEASED", "Offer Released"
        JOINED = "JOINED", "Joined"
        REJECTED = "REJECTED", "Rejected"
        ON_HOLD = "ON_HOLD", "On Hold"

    # --- Personal details (parsed) ---
    full_name = models.CharField(max_length=150, db_index=True)
    email = models.EmailField(blank=True, db_index=True)
    mobile = models.CharField(max_length=20, blank=True, db_index=True)
    address = models.TextField(blank=True)
    current_location = models.CharField(max_length=150, blank=True, db_index=True)

    # --- Experience (parsed) ---
    total_experience_years = models.DecimalField(
        max_digits=4, decimal_places=1, null=True, blank=True
    )
    relevant_experience_years = models.DecimalField(
        max_digits=4, decimal_places=1, null=True, blank=True
    )

    # --- Employment (parsed) ---
    current_company = models.CharField(max_length=150, blank=True, db_index=True)
    current_designation = models.CharField(max_length=150, blank=True)

    # --- Education (parsed) ---
    highest_qualification = models.CharField(max_length=150, blank=True)

    # Denormalized skills text kept in sync from CandidateSkill; feeds the
    # full-text search vector so skills/technologies are globally searchable.
    skills_cache = models.TextField(blank=True, editable=False)

    # Field keys the resume parser could NOT confidently extract (e.g.
    # ["email", "location", "qualification"]). Drives the UI "verify" badges so
    # the HR user knows which parsed fields to double-check (Module 3/5).
    parse_flags = models.JSONField(default=list, blank=True)

    # --- HR-editable fields (Module 5) ---
    # Legacy single-figure salary fields (kept so existing data is preserved).
    # The UI uses the fixed/variable CTC split below; totals/hike are computed
    # on the serializer.
    current_salary = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        help_text="Current CTC (legacy single figure).",
    )
    expected_salary = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    # CTC split into fixed + variable, expressed in LPA (lakhs per annum,
    # e.g. 16.20 == 16.2 LPA). Total & hike% are derived (see CandidateSerializer).
    current_ctc_fixed = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
        help_text="Current fixed CTC in LPA (lakhs per annum).",
    )
    current_ctc_variable = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
        help_text="Current variable CTC in LPA (lakhs per annum).",
    )
    expected_ctc_fixed = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
        help_text="Expected fixed CTC in LPA (lakhs per annum).",
    )
    expected_ctc_variable = models.DecimalField(
        max_digits=7, decimal_places=2, null=True, blank=True,
        help_text="Expected variable CTC in LPA (lakhs per annum).",
    )
    notice_period_days = models.PositiveIntegerField(null=True, blank=True)
    last_working_day = models.DateField(null=True, blank=True)

    candidate_status = models.CharField(
        max_length=25,
        choices=Status.choices,
        default=Status.RESUME_RECEIVED,
        db_index=True,
    )

    # PostgreSQL full-text search document (GIN-indexed below).
    search_vector = SearchVectorField(null=True, editable=False)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            # Global search targets (Module 9).
            models.Index(fields=["full_name"], name="cand_name_idx"),
            models.Index(fields=["email"], name="cand_email_idx"),
            models.Index(fields=["mobile"], name="cand_mobile_idx"),
            models.Index(fields=["current_location"], name="cand_location_idx"),
            # Dashboard / report filters.
            models.Index(fields=["candidate_status", "created_at"], name="cand_status_created_idx"),
            # Full-text search across name/email/company/skills.
            GinIndex(fields=["search_vector"], name="cand_search_gin_idx"),
        ]

    def __str__(self):
        return self.full_name or f"Candidate #{self.pk}"

    def rebuild_skills_cache(self, commit: bool = True):
        """Refresh the denormalized skills text from related CandidateSkill rows."""
        names = list(self.skills.values_list("name", flat=True))
        self.skills_cache = ", ".join(dict.fromkeys(names))  # de-dupe, keep order
        if commit:
            super().save(update_fields=["skills_cache"])


# ---------------------------------------------------------------------------
# Module 3 — normalized skills & experience
# ---------------------------------------------------------------------------
class CandidateSkill(models.Model):
    class SkillType(models.TextChoices):
        SKILL = "SKILL", "Skill"
        TECHNOLOGY = "TECHNOLOGY", "Technology"
        CERTIFICATION = "CERTIFICATION", "Certification"

    candidate = models.ForeignKey(
        Candidate, on_delete=models.CASCADE, related_name="skills"
    )
    name = models.CharField(max_length=100, db_index=True)
    skill_type = models.CharField(
        max_length=15, choices=SkillType.choices, default=SkillType.SKILL
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["candidate", "name", "skill_type"],
                name="uniq_candidate_skill",
            )
        ]
        indexes = [
            models.Index(fields=["name", "skill_type"], name="skill_name_type_idx"),
        ]

    def __str__(self):
        return f"{self.name} ({self.get_skill_type_display()})"


class CandidateExperience(models.Model):
    candidate = models.ForeignKey(
        Candidate, on_delete=models.CASCADE, related_name="experiences"
    )
    company = models.CharField(max_length=150)
    designation = models.CharField(max_length=150, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    is_current = models.BooleanField(default=False)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ["-is_current", "-end_date", "-start_date"]
        indexes = [
            models.Index(fields=["candidate", "is_current"], name="exp_cand_current_idx"),
        ]

    def __str__(self):
        return f"{self.designation} @ {self.company}".strip(" @")


# ---------------------------------------------------------------------------
# Module 2 — Resume
# ---------------------------------------------------------------------------
class Resume(models.Model):
    class ParseStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PROCESSING = "PROCESSING", "Processing"
        PARSED = "PARSED", "Parsed"
        FAILED = "FAILED", "Failed"

    class FileType(models.TextChoices):
        PDF = "PDF", "PDF"
        DOC = "DOC", "DOC"
        DOCX = "DOCX", "DOCX"

    # Nullable so a resume can be stored before its Candidate profile is created,
    # then linked once parsing produces a candidate.
    candidate = models.ForeignKey(
        Candidate,
        on_delete=models.CASCADE,
        related_name="resumes",
        null=True,
        blank=True,
    )
    file = models.FileField(upload_to="resumes/")
    original_filename = models.CharField(max_length=255, blank=True)
    file_type = models.CharField(max_length=5, choices=FileType.choices, blank=True)

    raw_text = models.TextField(blank=True)
    parse_status = models.CharField(
        max_length=12,
        choices=ParseStatus.choices,
        default=ParseStatus.PENDING,
        db_index=True,
    )
    parse_error = models.TextField(blank=True)

    uploaded_at = models.DateTimeField(auto_now_add=True, db_index=True)
    parsed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-uploaded_at"]
        indexes = [
            models.Index(fields=["parse_status", "uploaded_at"], name="resume_status_upl_idx"),
        ]

    def __str__(self):
        return self.original_filename or f"Resume #{self.pk}"


# ---------------------------------------------------------------------------
# Module 4 — Candidate ↔ Job mapping
# ---------------------------------------------------------------------------
class CandidateJobMapping(TimeStampedModel):
    """
    Tags a candidate to a job (Module 4). A candidate may map to multiple jobs.
    Business rule (User Story 2): closed jobs must not accept new mappings.
    """

    class Status(models.TextChoices):
        APPLIED = "APPLIED", "Applied"
        UNDER_REVIEW = "UNDER_REVIEW", "Under Review"
        SHORTLISTED = "SHORTLISTED", "Shortlisted"
        INTERVIEWING = "INTERVIEWING", "Interviewing"
        OFFERED = "OFFERED", "Offered"
        HIRED = "HIRED", "Hired"
        REJECTED = "REJECTED", "Rejected"
        ON_HOLD = "ON_HOLD", "On Hold"

    candidate = models.ForeignKey(
        Candidate, on_delete=models.CASCADE, related_name="job_mappings"
    )
    job = models.ForeignKey(
        Job, on_delete=models.CASCADE, related_name="candidate_mappings"
    )
    mapping_status = models.CharField(
        max_length=15, choices=Status.choices, default=Status.APPLIED, db_index=True
    )
    applied_date = models.DateField(default=timezone.localdate)
    recruiter_name = models.CharField(max_length=150, blank=True, db_index=True)

    class Meta:
        ordering = ["-applied_date"]
        constraints = [
            models.UniqueConstraint(
                fields=["candidate", "job"], name="uniq_candidate_job"
            )
        ]
        indexes = [
            models.Index(fields=["job", "mapping_status"], name="map_job_status_idx"),
            models.Index(fields=["recruiter_name"], name="map_recruiter_idx"),
        ]

    def __str__(self):
        return f"{self.candidate} → {self.job.job_id}"

    def clean(self):
        # Enforce the closed-job rule on creation (also enforced at the API layer).
        if self._state.adding and self.job_id and not self.job.is_open_for_mapping:
            raise ValidationError(
                {"job": "This job is closed/archived and cannot accept new candidate mappings unless reopened."}
            )

    def save(self, *args, **kwargs):
        if self._state.adding:
            self.full_clean()
        super().save(*args, **kwargs)


# ---------------------------------------------------------------------------
# Module 5 — Interview & Offer
# ---------------------------------------------------------------------------
class Interview(TimeStampedModel):
    class Result(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PASSED = "PASSED", "Passed"
        FAILED = "FAILED", "Failed"
        ON_HOLD = "ON_HOLD", "On Hold"

    mapping = models.ForeignKey(
        CandidateJobMapping, on_delete=models.CASCADE, related_name="interviews"
    )
    interview_date = models.DateField(null=True, blank=True)
    interview_time = models.TimeField(null=True, blank=True)
    interview_round = models.CharField(
        max_length=100, blank=True, help_text="e.g. 'Technical Round 1', 'HR Round'."
    )
    interviewer_name = models.CharField(max_length=150, blank=True)
    feedback = models.TextField(blank=True)
    result = models.CharField(
        max_length=10, choices=Result.choices, default=Result.PENDING
    )

    class Meta:
        ordering = ["interview_date", "interview_time"]
        indexes = [
            models.Index(fields=["interview_date"], name="interview_date_idx"),
            models.Index(fields=["mapping", "interview_date"], name="interview_map_date_idx"),
        ]

    def __str__(self):
        return f"Interview ({self.interview_round or 'round'}) for {self.mapping}"


class Offer(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        RELEASED = "RELEASED", "Released"
        ACCEPTED = "ACCEPTED", "Accepted"
        DECLINED = "DECLINED", "Declined"
        REVOKED = "REVOKED", "Revoked"

    # One live offer per candidate-job mapping.
    mapping = models.OneToOneField(
        CandidateJobMapping, on_delete=models.CASCADE, related_name="offer"
    )
    offered_salary = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    offer_status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.DRAFT, db_index=True
    )
    offer_date = models.DateField(null=True, blank=True)
    expected_joining_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-offer_date"]
        indexes = [
            models.Index(fields=["offer_status", "offer_date"], name="offer_status_date_idx"),
        ]

    def __str__(self):
        return f"Offer for {self.mapping} [{self.get_offer_status_display()}]"


# ---------------------------------------------------------------------------
# Recruitment status history (BRD entity "Recruitment Status")
# ---------------------------------------------------------------------------
class RecruitmentStatus(models.Model):
    """
    Append-only history of candidate status transitions.

    Design: candidate_status lives on Candidate as the *current* value; this
    table is the immutable trail of every change, which powers the Hiring
    Pipeline / Candidate Status charts (Module 7) and satisfies auditability.
    Optionally scoped to a specific job mapping.
    """

    candidate = models.ForeignKey(
        Candidate, on_delete=models.CASCADE, related_name="status_history"
    )
    mapping = models.ForeignKey(
        CandidateJobMapping,
        on_delete=models.SET_NULL,
        related_name="status_history",
        null=True,
        blank=True,
    )
    previous_status = models.CharField(
        max_length=25, choices=Candidate.Status.choices, blank=True
    )
    new_status = models.CharField(max_length=25, choices=Candidate.Status.choices)
    changed_at = models.DateTimeField(auto_now_add=True, db_index=True)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="status_changes",
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-changed_at"]
        verbose_name_plural = "Recruitment statuses"
        indexes = [
            models.Index(fields=["candidate", "changed_at"], name="rstatus_cand_time_idx"),
            models.Index(fields=["new_status"], name="rstatus_new_idx"),
        ]

    def __str__(self):
        return f"{self.candidate}: {self.previous_status or '∅'} → {self.new_status}"


# ---------------------------------------------------------------------------
# Module 8 — Report configuration
# ---------------------------------------------------------------------------
class ReportConfiguration(TimeStampedModel):
    class DateFilter(models.TextChoices):
        TODAY = "TODAY", "Today"
        YESTERDAY = "YESTERDAY", "Yesterday"
        THIS_WEEK = "THIS_WEEK", "This Week"
        LAST_WEEK = "LAST_WEEK", "Last Week"
        THIS_MONTH = "THIS_MONTH", "This Month"
        LAST_MONTH = "LAST_MONTH", "Last Month"
        THIS_YEAR = "THIS_YEAR", "This Year"
        CUSTOM = "CUSTOM", "Custom Date Range"

    class ExportFormat(models.TextChoices):
        EXCEL = "EXCEL", "Excel"
        CSV = "CSV", "CSV"
        PDF = "PDF", "PDF"

    name = models.CharField(max_length=150)
    date_filter = models.CharField(
        max_length=12, choices=DateFilter.choices, default=DateFilter.THIS_MONTH
    )
    custom_start = models.DateField(null=True, blank=True)
    custom_end = models.DateField(null=True, blank=True)
    # Ordered list of report column keys to include (Module 8 report columns).
    columns = models.JSONField(default=list, blank=True)
    export_format = models.CharField(
        max_length=6, choices=ExportFormat.choices, default=ExportFormat.EXCEL
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="report_configs",
    )

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


# ---------------------------------------------------------------------------
# Security — Audit log (BRD 5.Security "Audit logs for all data changes")
# ---------------------------------------------------------------------------
class AuditLog(models.Model):
    class Action(models.TextChoices):
        CREATE = "CREATE", "Create"
        UPDATE = "UPDATE", "Update"
        DELETE = "DELETE", "Delete"

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    action = models.CharField(max_length=6, choices=Action.choices)
    model_name = models.CharField(max_length=100, db_index=True)
    object_id = models.CharField(max_length=64, db_index=True)
    object_repr = models.CharField(max_length=255, blank=True)
    # Field-level diff: {field: {"old": ..., "new": ...}} (create/delete store the snapshot).
    changes = models.JSONField(null=True, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["model_name", "object_id"], name="audit_model_obj_idx"),
            models.Index(fields=["timestamp"], name="audit_time_idx"),
        ]

    def __str__(self):
        return f"{self.action} {self.model_name}#{self.object_id} @ {self.timestamp:%Y-%m-%d %H:%M}"


# ---------------------------------------------------------------------------
# Module 10 — Notifications
# ---------------------------------------------------------------------------
class Notification(models.Model):
    """
    In-app notification (Module 10).

    Single-user portal, so there is no fan-out: one row per event, optionally
    addressed to the HR user (``recipient``, nullable so events raised without an
    HTTP request — e.g. management commands — still record). The originating
    entity is referenced loosely via ``object_type`` / ``object_id`` (a light
    generic link that avoids a hard FK to every source model and never blocks a
    delete).

    Rows are created by ``core.signals`` on the BRD Module 10 triggers:
    Resume Uploaded, Candidate Tagged, Interview Scheduled, Offer Released,
    Candidate Joined.
    """

    class EventType(models.TextChoices):
        RESUME_UPLOADED = "RESUME_UPLOADED", "Resume Uploaded"
        CANDIDATE_TAGGED = "CANDIDATE_TAGGED", "Candidate Tagged"
        INTERVIEW_SCHEDULED = "INTERVIEW_SCHEDULED", "Interview Scheduled"
        OFFER_RELEASED = "OFFER_RELEASED", "Offer Released"
        CANDIDATE_JOINED = "CANDIDATE_JOINED", "Candidate Joined"

    event_type = models.CharField(
        max_length=20, choices=EventType.choices, db_index=True
    )
    message = models.CharField(max_length=255)
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
        null=True,
        blank=True,
    )
    # Loose link to the source entity (e.g. "Resume" / "42").
    object_type = models.CharField(max_length=50, blank=True)
    object_id = models.CharField(max_length=64, blank=True)

    is_read = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["is_read", "created_at"], name="notif_read_created_idx"),
            models.Index(fields=["event_type"], name="notif_event_idx"),
        ]

    def __str__(self):
        return f"[{self.get_event_type_display()}] {self.message}"
