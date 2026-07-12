"""
DRF serializers for HireTrack.

One serializer per BRD entity, plus a few purpose-built variants:

* ``JobSerializer``          — nested read/writable JobDescription, computed
                               ``candidate_count`` and ``is_open_for_mapping``.
* ``CandidateListSerializer``— lightweight projection for list endpoints.
* ``CandidateSerializer``    — full profile with nested skills / experiences /
                               job-mapping summary (Module 5).

Parsed fields stay writable so the HR user can correct extraction mistakes
(Module 5). Machine-managed fields (``job_id``, ``skills_cache``,
``search_vector``, timestamps, audit rows) are exposed read-only.
"""
from rest_framework import serializers

from .models import (
    AuditLog,
    Candidate,
    CandidateExperience,
    CandidateJobMapping,
    CandidateSkill,
    Interview,
    Job,
    JobDescription,
    Notification,
    Offer,
    RecruitmentStatus,
    ReportConfiguration,
    Resume,
)


# ---------------------------------------------------------------------------
# Module 1 & 6 — Job / Job Description
# ---------------------------------------------------------------------------
class JobDescriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = JobDescription
        fields = [
            "summary",
            "responsibilities",
            "required_skills",
            "qualifications",
            "benefits",
        ]


class JobSerializer(serializers.ModelSerializer):
    """Full Job read/write with a nested, writable JobDescription."""

    description = JobDescriptionSerializer(required=False)
    candidate_count = serializers.SerializerMethodField()
    is_open_for_mapping = serializers.BooleanField(read_only=True)

    class Meta:
        model = Job
        fields = [
            "id",
            "job_id",
            "job_role",
            "department",
            "hiring_manager",
            "experience_min_years",
            "experience_max_years",
            "location",
            "employment_type",
            "number_of_openings",
            "salary_min",
            "salary_max",
            "salary_currency",
            "job_status",
            "is_archived",
            "is_open_for_mapping",
            "closed_at",
            "candidate_count",
            "description",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "job_id", "closed_at", "created_at", "updated_at"]

    def get_candidate_count(self, obj) -> int:
        # Prefer an annotation set by the viewset queryset; fall back to a count.
        annotated = getattr(obj, "candidate_count", None)
        if annotated is not None:
            return annotated
        return obj.candidate_mappings.count()

    def validate(self, attrs):
        # Keep the experience range sane when both bounds are provided.
        emin = attrs.get("experience_min_years", getattr(self.instance, "experience_min_years", None))
        emax = attrs.get("experience_max_years", getattr(self.instance, "experience_max_years", None))
        if emin is not None and emax is not None and emax < emin:
            raise serializers.ValidationError(
                {"experience_max_years": "Must be greater than or equal to experience_min_years."}
            )
        smin = attrs.get("salary_min", getattr(self.instance, "salary_min", None))
        smax = attrs.get("salary_max", getattr(self.instance, "salary_max", None))
        if smin is not None and smax is not None and smax < smin:
            raise serializers.ValidationError(
                {"salary_max": "Must be greater than or equal to salary_min."}
            )
        return attrs

    def create(self, validated_data):
        description_data = validated_data.pop("description", None)
        job = Job.objects.create(**validated_data)
        if description_data:
            JobDescription.objects.create(job=job, **description_data)
        return job

    def update(self, instance, validated_data):
        description_data = validated_data.pop("description", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if description_data is not None:
            JobDescription.objects.update_or_create(
                job=instance, defaults=description_data
            )
        return instance


# ---------------------------------------------------------------------------
# Module 3 — Candidate skills & experiences
# ---------------------------------------------------------------------------
class CandidateSkillSerializer(serializers.ModelSerializer):
    class Meta:
        model = CandidateSkill
        fields = ["id", "candidate", "name", "skill_type"]


class CandidateExperienceSerializer(serializers.ModelSerializer):
    class Meta:
        model = CandidateExperience
        fields = [
            "id",
            "candidate",
            "company",
            "designation",
            "start_date",
            "end_date",
            "is_current",
            "description",
        ]


# ---------------------------------------------------------------------------
# Module 4/5 — Candidate ↔ Job mapping (summary + full)
# ---------------------------------------------------------------------------
class MappingSummarySerializer(serializers.ModelSerializer):
    """Compact mapping view embedded inside a Candidate profile."""

    job_id = serializers.CharField(source="job.job_id", read_only=True)
    job_role = serializers.CharField(source="job.job_role", read_only=True)
    job_status = serializers.CharField(source="job.job_status", read_only=True)

    class Meta:
        model = CandidateJobMapping
        fields = [
            "id",
            "job",
            "job_id",
            "job_role",
            "job_status",
            "mapping_status",
            "applied_date",
            "recruiter_name",
        ]


# ---------------------------------------------------------------------------
# Modules 3 & 5 — Candidate
# ---------------------------------------------------------------------------
class CandidateListSerializer(serializers.ModelSerializer):
    """Lightweight projection for list endpoints (Module 9 result rows)."""

    class Meta:
        model = Candidate
        fields = [
            "id",
            "full_name",
            "email",
            "mobile",
            "current_location",
            "current_company",
            "current_designation",
            "total_experience_years",
            "candidate_status",
            "skills_cache",
            "parse_flags",
            "created_at",
        ]


class CandidateSerializer(serializers.ModelSerializer):
    """Full candidate profile (Module 5). Parsed fields remain HR-editable."""

    skills = CandidateSkillSerializer(many=True, read_only=True)
    experiences = CandidateExperienceSerializer(many=True, read_only=True)
    job_mappings = MappingSummarySerializer(many=True, read_only=True)

    # Computed CTC totals & hike% (LPA). Read-only; derived from the
    # fixed/variable inputs below. Totals treat a missing part as 0 but stay
    # null when BOTH parts are null; hike% needs a positive current total.
    current_ctc_total = serializers.SerializerMethodField()
    expected_ctc_total = serializers.SerializerMethodField()
    hike_percent = serializers.SerializerMethodField()

    class Meta:
        model = Candidate
        fields = [
            "id",
            # Personal (parsed, editable)
            "full_name",
            "email",
            "mobile",
            "address",
            "current_location",
            # Experience (parsed, editable)
            "total_experience_years",
            "relevant_experience_years",
            # Employment (parsed, editable)
            "current_company",
            "current_designation",
            # Education (parsed, editable)
            "highest_qualification",
            # Denormalized skills text (machine-managed)
            "skills_cache",
            # Parser "verify" flags (machine-managed; read-only)
            "parse_flags",
            # HR-editable (Module 5)
            "current_salary",
            "expected_salary",
            # CTC split in LPA (editable inputs) + derived totals/hike (read-only)
            "current_ctc_fixed",
            "current_ctc_variable",
            "expected_ctc_fixed",
            "expected_ctc_variable",
            "current_ctc_total",
            "expected_ctc_total",
            "hike_percent",
            "notice_period_days",
            "last_working_day",
            "candidate_status",
            # Nested read-only detail
            "skills",
            "experiences",
            "job_mappings",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "skills_cache", "parse_flags", "created_at", "updated_at"]

    @staticmethod
    def _ctc_total(fixed, variable):
        """Sum fixed + variable (null treated as 0); None when BOTH are null."""
        if fixed is None and variable is None:
            return None
        return (fixed or 0) + (variable or 0)

    def get_current_ctc_total(self, obj):
        return self._ctc_total(obj.current_ctc_fixed, obj.current_ctc_variable)

    def get_expected_ctc_total(self, obj):
        return self._ctc_total(obj.expected_ctc_fixed, obj.expected_ctc_variable)

    def get_hike_percent(self, obj):
        current = self._ctc_total(obj.current_ctc_fixed, obj.current_ctc_variable)
        expected = self._ctc_total(obj.expected_ctc_fixed, obj.expected_ctc_variable)
        if current is None or expected is None or current <= 0:
            return None
        return round(float(expected - current) / float(current) * 100, 1)


class CandidateSetStatusSerializer(serializers.Serializer):
    """Payload for the ``set_status`` action (Module 6 / User Story 7)."""

    candidate_status = serializers.ChoiceField(choices=Candidate.Status.choices)
    notes = serializers.CharField(required=False, allow_blank=True)


# ---------------------------------------------------------------------------
# Recycle Bin — lightweight soft-deleted rows (candidates & jobs)
# ---------------------------------------------------------------------------
class RecycleBinCandidateSerializer(serializers.ModelSerializer):
    """Compact soft-deleted candidate row for the Recycle Bin listing."""

    class Meta:
        model = Candidate
        fields = ["id", "full_name", "candidate_status", "deleted_at", "created_at"]
        read_only_fields = fields


class RecycleBinJobSerializer(serializers.ModelSerializer):
    """Compact soft-deleted job row for the Recycle Bin listing."""

    class Meta:
        model = Job
        fields = ["id", "job_id", "job_role", "job_status", "deleted_at", "created_at"]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Module 4 — Candidate Job Mapping (full, writable)
# ---------------------------------------------------------------------------
class CandidateJobMappingSerializer(serializers.ModelSerializer):
    candidate_name = serializers.CharField(source="candidate.full_name", read_only=True)
    job_id = serializers.CharField(source="job.job_id", read_only=True)
    job_role = serializers.CharField(source="job.job_role", read_only=True)

    class Meta:
        model = CandidateJobMapping
        fields = [
            "id",
            "candidate",
            "candidate_name",
            "job",
            "job_id",
            "job_role",
            "mapping_status",
            "applied_date",
            "recruiter_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        # Enforce the closed-job rule at the API layer (User Story 2). The model
        # also guards this in clean()/save(); we surface a friendly 400 here.
        job = attrs.get("job") or getattr(self.instance, "job", None)
        if self.instance is None and job is not None and not job.is_open_for_mapping:
            raise serializers.ValidationError(
                {"job": "This job is closed/archived and cannot accept new candidate "
                        "mappings unless reopened."}
            )
        return attrs


# ---------------------------------------------------------------------------
# Module 5 — Interview & Offer
# ---------------------------------------------------------------------------
class InterviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = Interview
        fields = [
            "id",
            "mapping",
            "interview_date",
            "interview_time",
            "interview_round",
            "interviewer_name",
            "feedback",
            "result",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class OfferSerializer(serializers.ModelSerializer):
    class Meta:
        model = Offer
        fields = [
            "id",
            "mapping",
            "offered_salary",
            "offer_status",
            "offer_date",
            "expected_joining_date",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


# ---------------------------------------------------------------------------
# Recruitment status history (read-only)
# ---------------------------------------------------------------------------
class RecruitmentStatusSerializer(serializers.ModelSerializer):
    changed_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = RecruitmentStatus
        fields = [
            "id",
            "candidate",
            "mapping",
            "previous_status",
            "new_status",
            "changed_at",
            "changed_by",
            "notes",
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Module 2 — Resume
# ---------------------------------------------------------------------------
class ResumeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Resume
        fields = [
            "id",
            "candidate",
            "file",
            "original_filename",
            "file_type",
            "parse_status",
            "parse_error",
            "uploaded_at",
            "parsed_at",
        ]
        # Everything except the (optional) candidate link is machine-managed:
        # parsing populates raw_text / status / type in a later task.
        read_only_fields = [
            "id",
            "original_filename",
            "file_type",
            "parse_status",
            "parse_error",
            "uploaded_at",
            "parsed_at",
        ]


class ResumeUploadSerializer(serializers.Serializer):
    """Multipart upload payload for the Resume ``upload`` action (Module 2)."""

    file = serializers.FileField()
    candidate = serializers.PrimaryKeyRelatedField(
        queryset=Candidate.objects.all(), required=False, allow_null=True
    )


# ---------------------------------------------------------------------------
# Module 8 — Report configuration
# ---------------------------------------------------------------------------
class ReportConfigurationSerializer(serializers.ModelSerializer):
    created_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = ReportConfiguration
        fields = [
            "id",
            "name",
            "date_filter",
            "custom_start",
            "custom_end",
            "columns",
            "export_format",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def validate(self, attrs):
        date_filter = attrs.get(
            "date_filter", getattr(self.instance, "date_filter", None)
        )
        start = attrs.get("custom_start", getattr(self.instance, "custom_start", None))
        end = attrs.get("custom_end", getattr(self.instance, "custom_end", None))
        if date_filter == ReportConfiguration.DateFilter.CUSTOM:
            if not start or not end:
                raise serializers.ValidationError(
                    "custom_start and custom_end are required for a custom date range."
                )
            if end < start:
                raise serializers.ValidationError(
                    {"custom_end": "Must be on or after custom_start."}
                )
        return attrs


# ---------------------------------------------------------------------------
# Module 10 — Notifications (read-only; created by signals)
# ---------------------------------------------------------------------------
class NotificationSerializer(serializers.ModelSerializer):
    event_type_display = serializers.CharField(
        source="get_event_type_display", read_only=True
    )

    class Meta:
        model = Notification
        fields = [
            "id",
            "event_type",
            "event_type_display",
            "message",
            "object_type",
            "object_id",
            "is_read",
            "created_at",
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Security — Audit log (read-only)
# ---------------------------------------------------------------------------
class AuditLogSerializer(serializers.ModelSerializer):
    actor = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "actor",
            "action",
            "model_name",
            "object_id",
            "object_repr",
            "changes",
            "timestamp",
        ]
        read_only_fields = fields
