"""
Tests for the Recycle Bin (soft delete) + Reset feature.

These are DB-backed (``TestCase`` / DRF ``APITestCase``), so they require a test
database. They are intentionally kept in a separate module from ``tests.py``
(which is ``SimpleTestCase``-only and runs without a DB).

NOTE: these were NOT executed against the shared Neon instance during
development (to avoid creating a test database on production infrastructure);
the soft-delete behaviour was verified there with a rolled-back transaction
script. Run them wherever a throwaway Postgres is available:

    manage.py test core.test_softdelete
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from core.models import (
    AuditLog,
    Candidate,
    CandidateJobMapping,
    Job,
)


def _make_job(**kw):
    defaults = dict(job_role="Engineer", department="Eng", location="Remote")
    defaults.update(kw)
    return Job.objects.create(**defaults)


def _make_candidate(**kw):
    defaults = dict(full_name="Test Candidate")
    defaults.update(kw)
    return Candidate.objects.create(**defaults)


class SoftDeleteModelTests(TestCase):
    def test_soft_delete_hides_from_default_manager(self):
        cand = _make_candidate()
        cand.soft_delete()
        self.assertFalse(Candidate.objects.filter(pk=cand.pk).exists())
        self.assertTrue(Candidate.all_objects.filter(pk=cand.pk).exists())
        self.assertIsNotNone(Candidate.all_objects.get(pk=cand.pk).deleted_at)

    def test_restore_brings_it_back(self):
        job = _make_job()
        job.soft_delete()
        self.assertFalse(Job.objects.filter(pk=job.pk).exists())
        job.restore()
        self.assertTrue(Job.objects.filter(pk=job.pk).exists())
        self.assertIsNone(Job.objects.get(pk=job.pk).deleted_at)

    def test_base_manager_is_unfiltered(self):
        # Guards the design: cascades / related lookups must still see the row.
        self.assertFalse(hasattr(Candidate._base_manager, "get_queryset") and
                         Candidate._base_manager.get_queryset().query.where)

    def test_soft_delete_is_audited(self):
        cand = _make_candidate()
        cand.soft_delete()
        log = (
            AuditLog.objects.filter(
                model_name="Candidate", object_id=str(cand.pk), action="UPDATE"
            )
            .order_by("-timestamp")
            .first()
        )
        self.assertIsNotNone(log)
        self.assertIn("deleted_at", log.changes)


class SoftDeleteApiTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("hr", password="pw")
        self.client.force_authenticate(self.user)

    def test_delete_soft_deletes_candidate(self):
        cand = _make_candidate()
        resp = self.client.delete(f"/api/candidates/{cand.pk}/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Candidate.objects.filter(pk=cand.pk).exists())
        self.assertTrue(Candidate.all_objects.filter(pk=cand.pk).exists())
        # And it is no longer returned by the list endpoint.
        listing = self.client.get("/api/candidates/").json()
        ids = [c["id"] for c in listing["results"]]
        self.assertNotIn(cand.pk, ids)

    def test_delete_soft_deletes_job(self):
        job = _make_job()
        resp = self.client.delete(f"/api/jobs/{job.pk}/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Job.objects.filter(pk=job.pk).exists())
        self.assertTrue(Job.all_objects.filter(pk=job.pk).exists())

    def test_recycle_bin_lists_soft_deleted(self):
        cand = _make_candidate(full_name="Bin Person")
        job = _make_job(job_role="Bin Role")
        cand.soft_delete()
        job.soft_delete()
        data = self.client.get("/api/recycle-bin/").json()
        self.assertEqual([c["id"] for c in data["candidates"]], [cand.pk])
        self.assertEqual([j["id"] for j in data["jobs"]], [job.pk])
        self.assertIsNotNone(data["candidates"][0]["deleted_at"])

    def test_restore_endpoint(self):
        cand = _make_candidate()
        cand.soft_delete()
        resp = self.client.post(f"/api/candidates/{cand.pk}/restore/")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(Candidate.objects.filter(pk=cand.pk).exists())

    def test_purge_endpoint_hard_deletes(self):
        job = _make_job()
        job.soft_delete()
        resp = self.client.delete(f"/api/jobs/{job.pk}/purge/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Job.all_objects.filter(pk=job.pk).exists())

    def test_reset_soft_deletes_everything(self):
        _make_candidate()
        _make_candidate()
        _make_job()
        resp = self.client.post("/api/reset/")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["candidates_removed"], 2)
        self.assertEqual(body["jobs_removed"], 1)
        self.assertEqual(Candidate.objects.count(), 0)
        self.assertEqual(Job.objects.count(), 0)
        # All restorable from the bin.
        self.assertEqual(Candidate.all_objects.filter(deleted_at__isnull=False).count(), 2)

    def test_no_leak_in_search_and_mappings(self):
        job = _make_job()
        cand = _make_candidate(full_name="Searchable Unique Name")
        CandidateJobMapping.objects.create(candidate=cand, job=job, recruiter_name="R")
        cand.soft_delete()

        # Global search must not return the soft-deleted candidate.
        search = self.client.get("/api/search/", {"q": "Searchable Unique Name"}).json()
        self.assertEqual(search["count"], 0)

        # Mapping list must exclude mappings whose candidate is soft-deleted.
        mappings = self.client.get("/api/mappings/").json()
        self.assertEqual(mappings["count"], 0)

    def test_reset_keeps_report_configs_and_audit(self):
        _make_candidate()
        before_users = get_user_model().objects.count()
        self.client.post("/api/reset/")
        # Login user survives a reset.
        self.assertEqual(get_user_model().objects.count(), before_users)
        # Audit log is retained (and gained the soft-delete entries).
        self.assertTrue(AuditLog.objects.exists())
