"""
Management command: parse resumes that are still PENDING or previously FAILED.

Useful for bulk backfill and for reprocessing resumes that failed while the
Claude API key was missing/misconfigured, or that were uploaded before parsing
was enabled.

    python manage.py parse_pending_resumes
    python manage.py parse_pending_resumes --status PENDING
    python manage.py parse_pending_resumes --limit 50
"""
from django.core.management.base import BaseCommand

from core.models import Resume
from core.parsing import parse_resume


class Command(BaseCommand):
    help = "Parse resumes with parse_status in {PENDING, FAILED} (backfill/retry)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--status",
            choices=[Resume.ParseStatus.PENDING, Resume.ParseStatus.FAILED],
            action="append",
            help="Restrict to a specific status (repeatable). "
            "Defaults to both PENDING and FAILED.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Maximum number of resumes to process.",
        )

    def handle(self, *args, **options):
        statuses = options.get("status") or [
            Resume.ParseStatus.PENDING,
            Resume.ParseStatus.FAILED,
        ]
        qs = Resume.objects.filter(parse_status__in=statuses).order_by("uploaded_at")
        limit = options.get("limit")
        if limit:
            qs = qs[:limit]

        total = qs.count()
        if not total:
            self.stdout.write(self.style.SUCCESS("No resumes to parse."))
            return

        self.stdout.write(f"Parsing {total} resume(s)...")
        parsed = failed = 0
        # Materialize ids up front: parse_resume mutates parse_status, which would
        # otherwise shift the queryset window mid-iteration.
        for resume_id in list(qs.values_list("pk", flat=True)):
            resume = Resume.objects.get(pk=resume_id)
            label = resume.original_filename or f"Resume #{resume.pk}"
            try:
                parse_resume(resume)
            except Exception as exc:  # pragma: no cover - defensive
                failed += 1
                self.stderr.write(self.style.ERROR(f"  [{label}] crashed: {exc}"))
                continue

            resume.refresh_from_db(fields=["parse_status", "parse_error", "candidate"])
            if resume.parse_status == Resume.ParseStatus.PARSED:
                parsed += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  [{label}] PARSED -> candidate #{resume.candidate_id}"
                    )
                )
            else:
                failed += 1
                self.stderr.write(
                    self.style.WARNING(
                        f"  [{label}] {resume.parse_status}: {resume.parse_error}"
                    )
                )

        self.stdout.write(
            self.style.SUCCESS(f"Done. Parsed: {parsed}, failed: {failed}.")
        )
