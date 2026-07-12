# HireTrack — Database Schema Design

This document describes the HireTrack data model: the 13 BRD entities, their
relationships, indexing/full-text-search strategy, audit logging, and the two
design decisions the task called out explicitly (Job vs JobDescription split,
and the role of RecruitmentStatus).

All models live in `core/models.py`. The design goal is a **normalized, heavily
indexed** schema that scales to **1M+ resumes with sub-2-second global search**.

---

## 1. Entity map (BRD Section 7 → model)

| BRD entity | Model | Notes |
|---|---|---|
| User | `auth.User` + `Profile` | Single HR user; Django auth is reused. `Profile` (OneToOne) holds display name / phone / notification prefs. |
| Job | `Job` | The hiring requisition/opening (structured, queryable fields). |
| Job Description | `JobDescription` | OneToOne narrative detail of a `Job`. |
| Candidate | `Candidate` | Parsed profile + HR-editable fields. |
| Resume | `Resume` | File + parsed raw text + parse status. |
| Candidate Skills | `CandidateSkill` | Normalized (skill / technology / certification). |
| Candidate Experience | `CandidateExperience` | Normalized per-company work history. |
| Candidate Job Mapping | `CandidateJobMapping` | Candidate ↔ Job many-to-many (through). |
| Interview | `Interview` | Rounds, feedback, result — attached to a mapping. |
| Offer | `Offer` | OneToOne with a mapping. |
| Recruitment Status | `RecruitmentStatus` | Append-only status-transition history. |
| Report Configuration | `ReportConfiguration` | Saved report filters/columns/format. |
| Audit Log | `AuditLog` | Who/what/when/before-after for key models. |

---

## 2. Relationships (ER overview)

```
auth.User 1───1 Profile
auth.User 1───* AuditLog, RecruitmentStatus (changed_by), ReportConfiguration

Job 1───1 JobDescription
Job 1───* CandidateJobMapping *───1 Candidate

Candidate 1───* Resume
Candidate 1───* CandidateSkill
Candidate 1───* CandidateExperience
Candidate 1───* RecruitmentStatus

CandidateJobMapping 1───* Interview
CandidateJobMapping 1───1 Offer
CandidateJobMapping 1───* RecruitmentStatus (optional, per-job scope)
```

- A **candidate may map to multiple jobs** (Module 4) via `CandidateJobMapping`,
  which carries `mapping_status`, `applied_date`, and `recruiter_name`.
- `CandidateJobMapping` has a **unique constraint on (candidate, job)** so the
  same candidate cannot be tagged to the same job twice.
- Interviews and Offers hang off the **mapping**, not the candidate, so a
  candidate interviewing for two roles keeps independent pipelines.

---

## 3. Decision — Job vs JobDescription split

The BRD lists "Job" and "Job Description" as separate entities, and Module 1
mixes structured fields (Job Role, Department, Status…) with a free-text
"Job Description" field.

**Design chosen:**

- `Job` holds the **structured, frequently filtered/sorted columns**:
  `job_id` (auto), `job_role`, `department`, `hiring_manager`,
  `experience_min_years`/`experience_max_years`, `location`, `employment_type`,
  `number_of_openings`, `salary_min`/`salary_max`/`salary_currency`,
  `job_status`, `is_archived`.
- `JobDescription` (OneToOne, `related_name="description"`) holds the **heavy
  free text**: `summary`, `responsibilities`, `required_skills`,
  `qualifications`, `benefits`.

**Why:** the dashboard, search, and job lists scan/filter `Job` constantly.
Keeping large text blobs in a separate row keeps `Job` narrow, so index scans and
`SELECT`s over openings stay fast at scale. The split is 1:1 and optional to
populate, matching the BRD's two-entity model without duplicating data.

`Job.job_id` is auto-generated as `JOB-000123` (derived from the PK on first
save, zero-padded to 6 digits).

**Job status** uses the BRD Module 6 values `Open / In Progress / Closed / On Hold`
(Module 1 lists only three; Module 6 adds `On Hold`, which we include as the
superset). `is_archived` implements the BRD "Archive Job Description" feature
without deleting data.

---

## 4. Decision — RecruitmentStatus as status history

The BRD lists "Recruitment Status" as an entity, while candidate status is also a
dropdown on the candidate form. To avoid redundancy:

- The **current** status is `Candidate.candidate_status` (the 9 exact BRD values).
- `RecruitmentStatus` is the **immutable, append-only history** of every status
  transition: `previous_status → new_status`, `changed_at`, `changed_by`, `notes`,
  and an optional `mapping` for per-job scope.

**Why:** this powers the Module 7 charts (Hiring Pipeline, Candidate Status) and
gives a defensible recruitment audit trail, while keeping "what is the candidate's
status right now?" a single indexed column read. A `RecruitmentStatus` row is
written automatically by a signal whenever `Candidate.candidate_status` changes
(and once on creation). See `core/signals.py`.

**Candidate Status choices** (stored value → BRD label) match the BRD exactly:
Resume Received, Shortlisted, Interview Scheduled, Interview In Progress,
Interview Completed, Offer Released, Joined, Rejected, On Hold.

---

## 5. Indexing strategy (performance)

Targeted at the Module 9 global-search fields and dashboard/report filters.

**Single-column `db_index`:**
- `Candidate`: `full_name`, `email`, `mobile`, `current_location`,
  `current_company`, `candidate_status`, `created_at`.
- `Job`: `job_id` (unique), `job_role`, `department`, `location`, `job_status`,
  `is_archived`, `created_at`.
- `CandidateJobMapping`: `recruiter_name`, `mapping_status`.
- `CandidateSkill`: `name`.
- `Resume`: `parse_status`, `uploaded_at`.

**Composite indexes** (for common combined filters/sorts):
- `Job(job_status, is_archived)`, `Job(department, job_status)`.
- `Candidate(candidate_status, created_at)` — dashboard buckets + date reports.
- `CandidateSkill(name, skill_type)` — skill/technology lookup.
- `CandidateJobMapping(job, mapping_status)` — pipeline per job.
- `Interview(interview_date)`, `Interview(mapping, interview_date)`.
- `Offer(offer_status, offer_date)`.
- `RecruitmentStatus(candidate, changed_at)`, `RecruitmentStatus(new_status)`.
- `AuditLog(model_name, object_id)`, `AuditLog(timestamp)`.

**Unique constraints:**
- `Job.job_id` unique.
- `CandidateJobMapping(candidate, job)` unique.
- `CandidateSkill(candidate, name, skill_type)` unique.
- `Offer` OneToOne per mapping; `JobDescription` OneToOne per job.

---

## 6. Full-text search (Module 9, < 2s)

The BRD requires global search by Candidate Name, Mobile, Email, Skills,
Technologies, Job Role, and Recruiter, over 1M+ candidates.

- `Candidate.search_vector` is a PostgreSQL `SearchVectorField` with a
  **GIN index** (`cand_search_gin_idx`).
- It is a **weighted** document:
  - A: `full_name`
  - B: `current_designation`, `skills_cache`
  - C: `current_company`, `email`, `current_location`
  - D: `mobile`
- Skills/technologies are normalized in `CandidateSkill`, but for a single fast
  FTS query they are **denormalized into `Candidate.skills_cache`** (a
  non-editable text column kept in sync by signals) and folded into the vector.
- The vector and cache are maintained automatically via `post_save`/`post_delete`
  signals on `Candidate` and `CandidateSkill` (see `core/signals.py`,
  `refresh_candidate_search`). All updates use `QuerySet.update()`, so there is no
  signal recursion.
- Job Role and Recruiter search are served by their own B-tree indexes on
  `Job.job_role` and `CandidateJobMapping.recruiter_name`.

> Migration note: because `SearchVectorField` + `GinIndex` and the auto Job ID
> are best generated by Django to guarantee the migration matches `models.py`
> exactly, migrations are produced with `python manage.py makemigrations core`
> (see README) rather than hand-authored.

---

## 7. Audit logging (BRD 5. Security — "audit logs for all data changes")

- `AuditLog` records `actor`, `action` (CREATE/UPDATE/DELETE), `model_name`,
  `object_id`, `object_repr`, a JSON `changes` diff (`{field: {old, new}}`), and
  `timestamp`.
- Implemented as a **reusable signal mechanism** in `core/signals.py`:
  - `pre_save` snapshots the old row; `post_save` computes the field-level diff
    (UPDATE entries are skipped when nothing meaningful changed); `post_delete`
    stores the final snapshot.
  - Wired for the key entities: `Job`, `JobDescription`, `Candidate`, `Resume`,
    `CandidateJobMapping`, `Interview`, `Offer`.
- The **acting user** is captured by `CurrentUserMiddleware`
  (`core/middleware.py`) into a thread-local (`core/audit.py`) and read back inside
  the signals — signals have no access to the HTTP request. Management commands /
  tests can use `core.audit.acting_as(user)`.
- `AuditLog` is read-only in the admin (no add/change), preserving trail integrity.

---

## 8. Business rule — closed jobs reject new mappings (User Story 2)

`Job.is_open_for_mapping` is `False` when the job is `CLOSED` or archived.
`CandidateJobMapping.clean()` raises a `ValidationError` if a **new** mapping
targets such a job, and `.save()` calls `full_clean()` on creation. Existing
mappings are unaffected (so history survives when a job later closes). The REST
API will surface this as a 400 validation error.

---

## 9. Deferred to later tasks

Serializers/viewsets/endpoints, resume parsing (pdfplumber/python-docx + Claude),
report generation (Excel/CSV/PDF), dashboard aggregation, notifications, and the
React frontend are out of scope for this foundation task.
