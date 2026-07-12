"""Django admin registration for all HireTrack entities."""
from django.contrib import admin

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
    Profile,
    RecruitmentStatus,
    ReportConfiguration,
    Resume,
)


# ---------------------------------------------------------------------------
# Inlines
# ---------------------------------------------------------------------------
class JobDescriptionInline(admin.StackedInline):
    model = JobDescription
    extra = 0


class CandidateSkillInline(admin.TabularInline):
    model = CandidateSkill
    extra = 0


class CandidateExperienceInline(admin.TabularInline):
    model = CandidateExperience
    extra = 0


class ResumeInline(admin.TabularInline):
    model = Resume
    extra = 0
    fields = ("original_filename", "file_type", "parse_status", "uploaded_at")
    readonly_fields = ("uploaded_at",)


class InterviewInline(admin.TabularInline):
    model = Interview
    extra = 0


class OfferInline(admin.StackedInline):
    model = Offer
    extra = 0


# ---------------------------------------------------------------------------
# Model admins
# ---------------------------------------------------------------------------
@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "display_name", "phone")
    search_fields = ("user__username", "display_name", "phone")


@admin.register(Job)
class JobAdmin(admin.ModelAdmin):
    list_display = (
        "job_id",
        "job_role",
        "department",
        "location",
        "employment_type",
        "number_of_openings",
        "job_status",
        "is_archived",
        "deleted_at",
        "created_at",
    )
    list_filter = ("job_status", "employment_type", "department", "is_archived")
    search_fields = ("job_id", "job_role", "department", "hiring_manager", "location")
    readonly_fields = ("job_id", "created_at", "updated_at")
    inlines = [JobDescriptionInline]
    date_hierarchy = "created_at"

    def get_queryset(self, request):
        # Show soft-deleted (Recycle Bin) jobs in admin too; clear ``deleted_at``
        # to restore. The default ``objects`` manager would hide them.
        return Job.all_objects.get_queryset()


@admin.register(JobDescription)
class JobDescriptionAdmin(admin.ModelAdmin):
    list_display = ("job", "created_at", "updated_at")
    search_fields = ("job__job_id", "job__job_role", "required_skills")


@admin.register(Candidate)
class CandidateAdmin(admin.ModelAdmin):
    list_display = (
        "full_name",
        "email",
        "mobile",
        "current_location",
        "current_company",
        "total_experience_years",
        "candidate_status",
        "deleted_at",
        "created_at",
    )
    list_filter = ("candidate_status", "current_location")
    search_fields = (
        "full_name",
        "email",
        "mobile",
        "current_company",
        "current_designation",
        "skills_cache",
    )
    readonly_fields = ("skills_cache", "search_vector", "created_at", "updated_at")
    inlines = [CandidateSkillInline, CandidateExperienceInline, ResumeInline]
    date_hierarchy = "created_at"

    def get_queryset(self, request):
        # Show soft-deleted (Recycle Bin) candidates in admin too; clear
        # ``deleted_at`` to restore. The default ``objects`` manager hides them.
        return Candidate.all_objects.get_queryset()


@admin.register(CandidateSkill)
class CandidateSkillAdmin(admin.ModelAdmin):
    list_display = ("name", "skill_type", "candidate")
    list_filter = ("skill_type",)
    search_fields = ("name", "candidate__full_name")


@admin.register(CandidateExperience)
class CandidateExperienceAdmin(admin.ModelAdmin):
    list_display = ("candidate", "company", "designation", "is_current", "start_date", "end_date")
    list_filter = ("is_current",)
    search_fields = ("company", "designation", "candidate__full_name")


@admin.register(Resume)
class ResumeAdmin(admin.ModelAdmin):
    list_display = ("original_filename", "candidate", "file_type", "parse_status", "uploaded_at")
    list_filter = ("parse_status", "file_type")
    search_fields = ("original_filename", "candidate__full_name")
    readonly_fields = ("uploaded_at", "parsed_at", "raw_text")
    date_hierarchy = "uploaded_at"


@admin.register(CandidateJobMapping)
class CandidateJobMappingAdmin(admin.ModelAdmin):
    list_display = ("candidate", "job", "mapping_status", "recruiter_name", "applied_date")
    list_filter = ("mapping_status", "recruiter_name")
    search_fields = ("candidate__full_name", "job__job_id", "job__job_role", "recruiter_name")
    autocomplete_fields = ("candidate", "job")
    inlines = [InterviewInline, OfferInline]
    date_hierarchy = "applied_date"


@admin.register(Interview)
class InterviewAdmin(admin.ModelAdmin):
    list_display = ("mapping", "interview_round", "interview_date", "interview_time", "interviewer_name", "result")
    list_filter = ("result", "interview_date")
    search_fields = ("mapping__candidate__full_name", "interviewer_name", "interview_round")
    date_hierarchy = "interview_date"


@admin.register(Offer)
class OfferAdmin(admin.ModelAdmin):
    list_display = ("mapping", "offer_status", "offered_salary", "offer_date", "expected_joining_date")
    list_filter = ("offer_status",)
    search_fields = ("mapping__candidate__full_name", "mapping__job__job_id")
    date_hierarchy = "offer_date"


@admin.register(RecruitmentStatus)
class RecruitmentStatusAdmin(admin.ModelAdmin):
    list_display = ("candidate", "previous_status", "new_status", "changed_by", "changed_at")
    list_filter = ("new_status",)
    search_fields = ("candidate__full_name",)
    readonly_fields = ("changed_at",)
    date_hierarchy = "changed_at"


@admin.register(ReportConfiguration)
class ReportConfigurationAdmin(admin.ModelAdmin):
    list_display = ("name", "date_filter", "export_format", "created_by", "created_at")
    list_filter = ("date_filter", "export_format")
    search_fields = ("name",)


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("created_at", "event_type", "message", "recipient", "is_read")
    list_filter = ("event_type", "is_read")
    search_fields = ("message", "object_type", "object_id", "recipient__username")
    # Content is machine-generated; only the read flag is user-editable.
    readonly_fields = (
        "event_type",
        "message",
        "recipient",
        "object_type",
        "object_id",
        "created_at",
    )
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        return False


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("timestamp", "actor", "action", "model_name", "object_id", "object_repr")
    list_filter = ("action", "model_name")
    search_fields = ("model_name", "object_id", "object_repr", "actor__username")
    readonly_fields = ("actor", "action", "model_name", "object_id", "object_repr", "changes", "timestamp")
    date_hierarchy = "timestamp"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
