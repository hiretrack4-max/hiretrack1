"""
HireTrack API URL configuration.

A DRF ``DefaultRouter`` exposes CRUD ViewSets for every entity, plus two
purpose-built endpoints: global search (Module 9) and dashboard stats
(Module 7). Mounted under ``/api/`` from ``hiretrack/urls.py``.
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .auth_api import LoginView, LogoutView, MeView
from .api import (
    AuditLogViewSet,
    CandidateJobMappingViewSet,
    CandidateViewSet,
    DashboardStatsView,
    GlobalSearchView,
    InterviewViewSet,
    JobViewSet,
    NotificationViewSet,
    OfferViewSet,
    RecruitmentStatusViewSet,
    ReportConfigurationViewSet,
    ReportExportView,
    ResumeViewSet,
)

router = DefaultRouter()
router.register(r"jobs", JobViewSet, basename="job")
router.register(r"candidates", CandidateViewSet, basename="candidate")
router.register(r"mappings", CandidateJobMappingViewSet, basename="mapping")
router.register(r"interviews", InterviewViewSet, basename="interview")
router.register(r"offers", OfferViewSet, basename="offer")
router.register(r"resumes", ResumeViewSet, basename="resume")
router.register(r"report-configs", ReportConfigurationViewSet, basename="report-config")
router.register(r"recruitment-status", RecruitmentStatusViewSet, basename="recruitment-status")
router.register(r"notifications", NotificationViewSet, basename="notification")
router.register(r"audit-logs", AuditLogViewSet, basename="audit-log")

urlpatterns = [
    # Token auth (SPA login/logout/identity).
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("search/", GlobalSearchView.as_view(), name="global-search"),
    path("dashboard/stats/", DashboardStatsView.as_view(), name="dashboard-stats"),
    path("reports/export/", ReportExportView.as_view(), name="report-export"),
    path("", include(router.urls)),
]
