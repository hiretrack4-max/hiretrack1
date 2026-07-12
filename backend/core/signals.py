"""
Signal wiring for HireTrack.

Two responsibilities:

1. Audit logging — record create/update/delete (who / what / when / before-after)
   for the key recruitment entities into ``AuditLog``. The acting user comes from
   the thread-local populated by ``CurrentUserMiddleware``.

2. Full-text search maintenance — keep ``Candidate.skills_cache`` and
   ``Candidate.search_vector`` in sync so global search (Module 9) stays fast,
   and append a ``RecruitmentStatus`` row whenever a candidate's status changes.

All search-vector / skills-cache writes use ``QuerySet.update()`` (which does NOT
re-emit ``post_save``), so there is no signal recursion.
"""
import datetime
import logging
from decimal import Decimal

from django.conf import settings
from django.contrib.postgres.search import SearchVector
from django.core.mail import send_mail
from django.db import transaction
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from .audit import get_current_user
from .models import (
    AuditLog,
    Candidate,
    CandidateJobMapping,
    CandidateSkill,
    Interview,
    Job,
    JobDescription,
    Notification,
    Offer,
    RecruitmentStatus,
    Resume,
)

logger = logging.getLogger(__name__)

# Models for which we keep a full audit trail.
AUDITED_MODELS = [
    Job,
    JobDescription,
    Candidate,
    Resume,
    CandidateJobMapping,
    Interview,
    Offer,
]

# Fields never included in an audit snapshot (opaque or always-changing).
_EXCLUDED_FIELDS = {"search_vector", "updated_at"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _json_safe(value):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (datetime.datetime, datetime.date, datetime.time)):
        return value.isoformat()
    return str(value)


def _snapshot(instance):
    """JSON-safe {field_attname: value} snapshot of a model instance."""
    data = {}
    for field in instance._meta.fields:
        if field.name in _EXCLUDED_FIELDS:
            continue
        data[field.attname] = _json_safe(field.value_from_object(instance))
    return data


# ---------------------------------------------------------------------------
# Audit logging
# ---------------------------------------------------------------------------
def _capture_old(sender, instance, **kwargs):
    if instance.pk and not instance._state.adding:
        try:
            # ``_base_manager`` is unfiltered, so this still finds soft-deleted
            # rows (Job/Candidate use a default manager that hides them). Without
            # it a restore would fail to snapshot the pre-change state.
            instance._audit_old = _snapshot(sender._base_manager.get(pk=instance.pk))
        except sender.DoesNotExist:
            instance._audit_old = None
    else:
        instance._audit_old = None


def _log_save(sender, instance, created, **kwargs):
    new_snap = _snapshot(instance)
    if created:
        changes = {k: {"old": None, "new": v} for k, v in new_snap.items()}
        action = AuditLog.Action.CREATE
    else:
        old = getattr(instance, "_audit_old", None) or {}
        changes = {
            k: {"old": old.get(k), "new": v}
            for k, v in new_snap.items()
            if old.get(k) != v
        }
        if not changes:
            return  # no meaningful change -> no log entry
        action = AuditLog.Action.UPDATE

    AuditLog.objects.create(
        actor=get_current_user(),
        action=action,
        model_name=sender.__name__,
        object_id=str(instance.pk),
        object_repr=str(instance)[:255],
        changes=changes,
    )


def _log_delete(sender, instance, **kwargs):
    AuditLog.objects.create(
        actor=get_current_user(),
        action=AuditLog.Action.DELETE,
        model_name=sender.__name__,
        object_id=str(instance.pk),
        object_repr=str(instance)[:255],
        changes=_snapshot(instance),
    )


for _model in AUDITED_MODELS:
    pre_save.connect(_capture_old, sender=_model, dispatch_uid=f"audit_old_{_model.__name__}")
    post_save.connect(_log_save, sender=_model, dispatch_uid=f"audit_save_{_model.__name__}")
    post_delete.connect(_log_delete, sender=_model, dispatch_uid=f"audit_delete_{_model.__name__}")


# ---------------------------------------------------------------------------
# Candidate full-text search + skills cache
# ---------------------------------------------------------------------------
def refresh_candidate_search(candidate_id):
    """Rebuild skills_cache then the search_vector for one candidate."""
    names = list(
        CandidateSkill.objects.filter(candidate_id=candidate_id)
        .values_list("name", flat=True)
    )
    skills_text = ", ".join(dict.fromkeys(names))

    # Step 1: persist denormalized skills text.
    Candidate.objects.filter(pk=candidate_id).update(skills_cache=skills_text)

    # Step 2: recompute the weighted search document (reads the fresh skills_cache).
    Candidate.objects.filter(pk=candidate_id).update(
        search_vector=(
            SearchVector("full_name", weight="A")
            + SearchVector("current_designation", weight="B")
            + SearchVector("skills_cache", weight="B")
            + SearchVector("current_company", weight="C")
            + SearchVector("email", weight="C")
            + SearchVector("current_location", weight="C")
            + SearchVector("mobile", weight="D")
        )
    )


@receiver(post_save, sender=Candidate, dispatch_uid="candidate_search_refresh")
def _candidate_saved(sender, instance, **kwargs):
    refresh_candidate_search(instance.pk)


@receiver(post_save, sender=CandidateSkill, dispatch_uid="skill_saved_refresh")
def _skill_saved(sender, instance, **kwargs):
    refresh_candidate_search(instance.candidate_id)


@receiver(post_delete, sender=CandidateSkill, dispatch_uid="skill_deleted_refresh")
def _skill_deleted(sender, instance, **kwargs):
    refresh_candidate_search(instance.candidate_id)


# ---------------------------------------------------------------------------
# Candidate status-transition history (feeds RecruitmentStatus)
# ---------------------------------------------------------------------------
@receiver(post_save, sender=Candidate, dispatch_uid="candidate_status_history")
def _record_candidate_status(sender, instance, created, **kwargs):
    if created:
        RecruitmentStatus.objects.create(
            candidate=instance,
            previous_status="",
            new_status=instance.candidate_status,
            changed_by=get_current_user(),
        )
        return
    old = getattr(instance, "_audit_old", None) or {}
    old_status = old.get("candidate_status")
    if old_status is not None and old_status != instance.candidate_status:
        RecruitmentStatus.objects.create(
            candidate=instance,
            previous_status=old_status or "",
            new_status=instance.candidate_status,
            changed_by=get_current_user(),
        )


# ---------------------------------------------------------------------------
# Module 10 — In-app notifications
# ---------------------------------------------------------------------------
# Triggers (BRD Module 10): Resume Uploaded, Candidate Tagged, Interview
# Scheduled, Offer Released, Candidate Joined.
#
# Duplicate-avoidance strategy:
#   * Interview Scheduled fires only on Interview creation (with a date) — NOT
#     also on a candidate status change to INTERVIEW_SCHEDULED — so scheduling an
#     interview yields exactly one notification.
#   * Offer Released fires only on the transition INTO ``RELEASED`` (created as
#     released, or old status != RELEASED), reusing the ``_audit_old`` snapshot
#     that the audit ``pre_save`` already captures — editing an already-released
#     offer does not re-notify.
#   * Candidate Joined fires only on the transition INTO ``JOINED`` (same
#     ``_audit_old`` snapshot used by the status-history recorder), so it never
#     double-fires.
#
# Creation is deferred to ``transaction.on_commit`` and defensively wrapped, so a
# notification failure can never roll back or break the underlying save.


def _queue_notification(event_type, message, obj=None, recipient=None):
    object_type = obj.__class__.__name__ if obj is not None else ""
    object_id = str(obj.pk) if (obj is not None and obj.pk) else ""
    user = recipient if recipient is not None else get_current_user()
    message = (message or "")[:255]

    def _create():
        try:
            Notification.objects.create(
                event_type=event_type,
                message=message,
                recipient=user,
                object_type=object_type,
                object_id=object_id,
            )
        except Exception:  # pragma: no cover - defensive; must never break saves
            logger.exception("Failed to create %s notification.", event_type)

    # Runs after the surrounding transaction commits (immediately in autocommit);
    # if the transaction rolls back, no notification is created.
    transaction.on_commit(_create)


@receiver(post_save, sender=Resume, dispatch_uid="notify_resume_uploaded")
def _notify_resume_uploaded(sender, instance, created, **kwargs):
    if not created:
        return
    if instance.candidate_id:
        name = instance.candidate.full_name
    else:
        name = instance.original_filename or f"Resume #{instance.pk}"
    _queue_notification(
        Notification.EventType.RESUME_UPLOADED,
        f"Resume uploaded: {name}",
        obj=instance,
    )


@receiver(post_save, sender=CandidateJobMapping, dispatch_uid="notify_candidate_tagged")
def _notify_candidate_tagged(sender, instance, created, **kwargs):
    if not created:
        return
    msg = (
        f"{instance.candidate.full_name} tagged to "
        f"{instance.job.job_id} — {instance.job.job_role}"
    )
    _queue_notification(Notification.EventType.CANDIDATE_TAGGED, msg, obj=instance)


def _send_interview_email(candidate_name, job_role, date_str, time_str, interviewer):
    """Best-effort HR email for a scheduled interview.

    Wrapped so a mail failure (bad SMTP creds, network, etc.) can NEVER break the
    Interview save — the exception is logged and swallowed. With the default
    console EMAIL_BACKEND this simply prints the message to the server log.
    """
    try:
        subject = f"HireTrack: Interview scheduled — {candidate_name}"
        body = "\n".join(
            [
                "An interview has been scheduled.",
                "",
                f"Candidate:   {candidate_name}",
                f"Role:        {job_role}",
                f"Date:        {date_str}",
                f"Time:        {time_str or 'TBD'}",
                f"Interviewer: {interviewer or 'TBD'}",
                "",
                "— HireTrack",
            ]
        )
        send_mail(
            subject,
            body,
            settings.DEFAULT_FROM_EMAIL,
            [settings.HR_NOTIFY_EMAIL],
            fail_silently=False,
        )
    except Exception:  # pragma: no cover - defensive; email is best-effort
        logger.exception("Failed to send interview-scheduled email.")


@receiver(post_save, sender=Interview, dispatch_uid="notify_interview_scheduled")
def _notify_interview_scheduled(sender, instance, created, **kwargs):
    """Notify (in-app + email) when an interview gets a scheduled date/time.

    Fires when the interview is created with a date, or when an existing
    interview's scheduled date/time is set or changed. Unrelated edits (feedback,
    result, interviewer with no schedule change) do NOT re-notify, so the same
    notification is not spammed on every save.
    """
    if not instance.interview_date:
        return

    # ``_audit_old`` is the pre_save snapshot captured by the audit handler
    # (Interview is an audited model). Values are JSON-safe strings there, so we
    # compare against ISO-format strings of the new values.
    new_date_iso = instance.interview_date.isoformat()
    new_time_iso = instance.interview_time.isoformat() if instance.interview_time else None
    if not created:
        old = getattr(instance, "_audit_old", None) or {}
        if old.get("interview_date") == new_date_iso and old.get("interview_time") == new_time_iso:
            return  # schedule unchanged -> no notification / email

    mapping = instance.mapping
    candidate_name = mapping.candidate.full_name
    job_role = mapping.job.job_role
    date_str = instance.interview_date.strftime("%d/%m/%Y")
    time_str = instance.interview_time.strftime("%H:%M") if instance.interview_time else None

    msg = f"Interview scheduled: {candidate_name} on {date_str}"
    if time_str:
        msg += f" at {time_str}"
    msg += f" ({job_role})"
    _queue_notification(Notification.EventType.INTERVIEW_SCHEDULED, msg, obj=instance)

    # Email HR after the surrounding transaction commits (best-effort).
    transaction.on_commit(
        lambda: _send_interview_email(
            candidate_name, job_role, date_str, time_str, instance.interviewer_name
        )
    )


@receiver(post_save, sender=Offer, dispatch_uid="notify_offer_released")
def _notify_offer_released(sender, instance, created, **kwargs):
    if instance.offer_status != Offer.Status.RELEASED:
        return
    old = getattr(instance, "_audit_old", None) or {}
    if not created and old.get("offer_status") == Offer.Status.RELEASED:
        return  # already released -> not a new transition
    mapping = instance.mapping
    msg = (
        f"Offer released to {mapping.candidate.full_name} for "
        f"{mapping.job.job_id} — {mapping.job.job_role}"
    )
    _queue_notification(Notification.EventType.OFFER_RELEASED, msg, obj=instance)


@receiver(post_save, sender=Candidate, dispatch_uid="notify_candidate_joined")
def _notify_candidate_joined(sender, instance, created, **kwargs):
    if instance.candidate_status != Candidate.Status.JOINED:
        return
    old = getattr(instance, "_audit_old", None) or {}
    if not created and old.get("candidate_status") == Candidate.Status.JOINED:
        return  # already joined -> not a new transition
    _queue_notification(
        Notification.EventType.CANDIDATE_JOINED,
        f"{instance.full_name} has joined",
        obj=instance,
    )
