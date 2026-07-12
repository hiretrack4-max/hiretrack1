# HireTrack — Backend

Single-user HR Recruitment Portal. Django 5 + Django REST Framework + PostgreSQL.

This repository currently contains the **backend foundation**: project config,
the fully-designed database schema (13 BRD entities), Django admin, audit logging,
and PostgreSQL full-text search. The REST API endpoints and the React frontend are
delivered in later tasks.

## Tech stack

- Django 5 + Django REST Framework
- PostgreSQL 16 (run via Docker)
- `django.contrib.postgres` for full-text search (SearchVector + GIN index)
- Claude API (Anthropic) for resume parsing — wired up in a later task
- Exports: openpyxl (Excel/CSV), reportlab (PDF) — used in a later task

## Project layout

```
D:\HireTrack\
├─ docker-compose.yml            # PostgreSQL 16 service (`db`)
├─ requirement1.txt              # BRD
└─ backend\
   ├─ manage.py
   ├─ requirements.txt
   ├─ .env.example               # copy to .env
   ├─ README.md                  # this file
   ├─ SCHEMA.md                  # ER design, indexes, FTS, audit logging
   ├─ hiretrack\                 # project config
   │  ├─ settings.py  urls.py  wsgi.py  asgi.py  __init__.py
   └─ core\                      # the single app that holds all 13 entities
      ├─ models.py               # schema (Job, Candidate, Resume, ...)
      ├─ admin.py                # all models registered
      ├─ api.py                  # DRF ViewSets (resume upload/reparse, report export, notifications)
      ├─ serializers.py
      ├─ reports.py              # Module 8 report builder + Excel/CSV/PDF generators
      ├─ signals.py              # audit logging + FTS maintenance + status history + notifications
      ├─ audit.py  middleware.py # acting-user capture for audit logs
      ├─ parsing\                # resume parsing pipeline (Modules 2 & 3)
      │  ├─ extract.py           # PDF/DOCX/DOC -> raw text (ExtractionError)
      │  ├─ extractor.py         # ParsedResume, Claude + heuristic extractors, factory
      │  └─ service.py           # parse_resume() orchestration
      ├─ management\commands\
      │  └─ parse_pending_resumes.py   # bulk/backfill parsing
      ├─ apps.py
      └─ migrations\__init__.py  # run makemigrations (see below)
```

## First-time setup — commands to run yourself

Run these from `D:\HireTrack\backend` (PowerShell) unless noted.

```powershell
# 1) Start PostgreSQL 16 (run from D:\HireTrack where docker-compose.yml lives)
cd D:\HireTrack
docker compose up -d db
cd D:\HireTrack\backend

# 2) Create & activate a virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 3) Install dependencies
pip install -r requirements.txt

# 4) Create your .env from the template (then edit values if needed)
Copy-Item .env.example .env

# 5) Generate migrations from the models, then apply them
#    (migrations are intentionally NOT hand-authored — Django generates a
#     schema that exactly matches models.py, including the GIN/FTS index.)
python manage.py makemigrations core
python manage.py migrate

# 6) Create the single HR user (superuser)
python manage.py createsuperuser

# 7) Run the development server
python manage.py runserver
```

Then:

- Admin: http://127.0.0.1:8000/admin/
- Health check: http://127.0.0.1:8000/healthz/

## Configuration

All configuration is via environment variables loaded from `backend/.env`
(see `.env.example` for the full list and defaults). Key variables:

| Variable | Default | Purpose |
|---|---|---|
| `POSTGRES_DB/USER/PASSWORD/HOST/PORT` | hiretrack / hiretrack / hiretrack / localhost / 5432 | Database connection (matches docker-compose) |
| `DJANGO_SECRET_KEY` | dev placeholder | **Change for production** |
| `DJANGO_DEBUG` | True | Debug mode |
| `ANTHROPIC_API_KEY` | (empty) | Claude API key for resume parsing. Empty → built-in heuristic parser is used. |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5-20251001` | Model used for Claude-powered extraction |
| `RESUME_PARSING_ENABLED` | True | Set False to store uploads without parsing |
| `RESUME_PARSE_TIMEOUT` | 10 | Wall-clock timeout (s) for the Claude call (10s budget) |
| `RESUME_PARSE_MAX_TOKENS` | 2048 | Max tokens the extractor may generate |

## Notes

- Uploaded resumes are stored under `backend/media/resumes/` (git-ignored).
- Audit logging, full-text search maintenance, and candidate status-history
  recording are all automatic via signals — see `core/signals.py`.
- The closed-job mapping rule (a closed/archived job rejects new candidate
  mappings) is enforced in `CandidateJobMapping.clean()/save()`; the API layer
  will surface it as a validation error.
- See `SCHEMA.md` for the full database design.

## API Reference

All endpoints are mounted under `/api/` and require authentication
(`IsAuthenticated`; SessionAuthentication + BasicAuthentication). Responses are
JSON; list endpoints are page-number paginated (`?page=`, page size 25). Standard
DRF filtering (`django-filter`), `?search=` and `?ordering=` are available on the
ViewSets noted below. CORS is enabled for the Vite dev server (`localhost:5173`).

### CRUD ViewSets (DefaultRouter)

| Method(s) | Path | Purpose |
|---|---|---|
| GET, POST | `/api/jobs/` | List / create jobs (nested writable JobDescription; `candidate_count`, `is_open_for_mapping`). Filters: `job_status`, `department`, `employment_type`, `is_archived`. |
| GET, PUT, PATCH, DELETE | `/api/jobs/{id}/` | Retrieve / update / delete a job (status changes via `job_status`). |
| POST | `/api/jobs/{id}/archive/` | Archive a job. |
| POST | `/api/jobs/{id}/unarchive/` | Unarchive a job. |
| GET, POST | `/api/candidates/` | List (lightweight) / create candidates. Filters: `candidate_status`, `current_location`. |
| GET, PUT, PATCH, DELETE | `/api/candidates/{id}/` | Full candidate profile with nested `skills`, `experiences`, `job_mappings`. Parsed fields stay editable (Module 5). |
| POST | `/api/candidates/{id}/set_status/` | Change `candidate_status` (body: `candidate_status`, optional `notes`); records a RecruitmentStatus history row. |
| GET, POST | `/api/mappings/` | List / create candidate↔job mappings (Module 4). Enforces the closed-job rule (400). Filters: `job`, `candidate`, `mapping_status`, `recruiter_name`. |
| GET, PUT, PATCH, DELETE | `/api/mappings/{id}/` | Retrieve / update / delete a mapping. |
| GET, POST | `/api/interviews/` | List / create interviews. Filter: `interview_date` (range: `interview_date_after` / `interview_date_before`), `mapping`, `result`. |
| GET, PUT, PATCH, DELETE | `/api/interviews/{id}/` | Retrieve / update / delete an interview. |
| GET, POST | `/api/offers/` | List / create offers. Filters: `offer_status`, `mapping`. |
| GET, PUT, PATCH, DELETE | `/api/offers/{id}/` | Retrieve / update / delete an offer. |
| GET, POST | `/api/resumes/` | List / create resume records. |
| POST | `/api/resumes/upload/` | **Multipart upload** (PDF/DOC/DOCX). Validates extension + content type, stores the file, then **parses synchronously** (Modules 2 & 3). A parse failure never fails the upload — the file is still stored (201) and the response carries the resume with `parse_status` (`PARSED`/`FAILED`) and, if parsed, the created/linked `candidate` id. Rejects unsupported formats with 400. |
| POST | `/api/resumes/{id}/reparse/` | **Re-run parsing on demand.** Re-extracts text and re-populates the linked Candidate. Resilient: records FAILED + `parse_error` and still returns 200 with the current `parse_status`. |
| GET, PUT, PATCH, DELETE | `/api/resumes/{id}/` | Retrieve / update / delete a resume record. |
| GET, POST | `/api/report-configs/` | List / create saved report configurations (Module 8). File generation deferred. |
| GET, PUT, PATCH, DELETE | `/api/report-configs/{id}/` | Retrieve / update / delete a report configuration. |

### Read-only ViewSets

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/recruitment-status/` , `/api/recruitment-status/{id}/` | Candidate status-transition history. Filters: `candidate`, `new_status`, `mapping`. |
| GET | `/api/notifications/` , `/api/notifications/{id}/` | **Notifications (Module 10)**, newest first. Filters: `is_read`, `event_type`. |
| GET | `/api/notifications/unread_count/` | Returns `{"unread": <n>}`. |
| POST | `/api/notifications/{id}/mark_read/` | Mark one notification read. |
| POST | `/api/notifications/mark_all_read/` | Mark all unread read → `{"marked_read": <n>}`. |
| GET | `/api/audit-logs/` , `/api/audit-logs/{id}/` | Audit trail (read-only). Filters: `action`, `model_name`, `object_id`. |

### Purpose-built endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/search/?q=<term>` | **Global search (Module 9)** — candidates by name / mobile / email / skills / technologies / job role / recruiter. Uses the PostgreSQL FTS `search_vector` (GIN-indexed) ranked by `SearchRank`, with `icontains` fallbacks for partial and mapping-derived (job role, recruiter) matches. Returns `{query, count, results[]}`. |
| GET | `/api/dashboard/stats/` | **Dashboard (Module 7)** — KPIs (total/open/closed jobs, candidates uploaded, interview scheduled, offers released, joined, rejected) and 4 chart series (hiring pipeline, candidate status, job status, department-wise hiring). Computed with `values().annotate(Count(...))` aggregates. |
| GET | `/api/reports/export/` | **Report export (Module 8)** — downloads Excel/CSV/PDF. Params: `format=excel\|csv\|pdf`, `date_filter=THIS_MONTH\|…\|CUSTOM`, `start`/`end` (`YYYY-MM-DD`, for CUSTOM), `columns=col1,col2` (subset/reorder), `config=<ReportConfiguration id>` (supplies defaults; explicit params override). Returns an attachment with the right `Content-Type`; 400 on bad format/date. |

## Resume parsing (Modules 2 & 3)

Parsing runs **automatically and synchronously on upload** (single-user load,
targeting the 10s budget in BRD §5), and can be re-run on demand via
`POST /api/resumes/{id}/reparse/`. The pipeline lives under `core/parsing/`:

1. **Text extraction** (`extract.py`) — PDF via `pdfplumber`, DOCX via
   `python-docx`, legacy `.doc` via a best-effort binary scrape (falls back to a
   clear error prompting a PDF/DOCX re-upload). Encrypted/empty/corrupt files
   raise a typed `ExtractionError`.
2. **Field extraction** (`extractor.py`) — behind a pluggable `ResumeExtractor`
   interface returning a `ParsedResume` dataclass:
   - `ClaudeResumeExtractor` — Anthropic SDK (`ANTHROPIC_MODEL`, default
     `claude-haiku-4-5-20251001`), a strict-JSON prompt parsed defensively,
     bounded by `RESUME_PARSE_TIMEOUT`.
   - `HeuristicResumeExtractor` — regex/keyword fallback (email, phone with
     country codes, name heuristic, a built-in skills keyword list + a "Skills"
     section parser, experience-years and degree keywords). It never raises.
   - `get_extractor()` returns Claude when `ANTHROPIC_API_KEY` is set, else the
     heuristic. **On any Claude error the pipeline falls back to the heuristic
     extractor automatically** and logs which extractor was used.
3. **Orchestration** (`service.py`) — `parse_resume(resume)` sets
   `PROCESSING`, extracts text (stored on `Resume.raw_text`), runs the extractor,
   then **atomically** creates/updates the linked `Candidate`, replaces its
   `CandidateSkill` rows (skills + technologies + certifications with the correct
   `skill_type`) and `CandidateExperience` rows, rebuilds the skills cache, and
   sets `PARSED` + `parsed_at`. On failure it sets `FAILED` + `parse_error` and
   never leaves the resume `PROCESSING`. The existing search-vector / skills-cache
   signals fire on the candidate save, so the new candidate is immediately
   searchable (Module 9).

   **De-duplication:** if the resume already has a candidate, that record is
   updated; otherwise, if the parsed email matches an existing candidate the
   resume is linked to (and updates) that profile; otherwise a new candidate is
   created. Email is used as the stable natural key (name collisions are common).

**No model changes / migrations were required** — the pipeline populates the
existing `Resume`, `Candidate`, `CandidateSkill`, and `CandidateExperience`
fields. (Adding any new model field later would need a migration.)

### Bulk / backfill

```powershell
# Parse all PENDING + FAILED resumes (e.g. after setting ANTHROPIC_API_KEY)
python manage.py parse_pending_resumes
python manage.py parse_pending_resumes --status PENDING --limit 100
```

## Reports (Module 8)

Recruitment reports are generated on demand as **Excel / CSV / PDF** downloads via
`GET /api/reports/export/`. The generator lives in `core/reports.py`:

- **Columns** (exact BRD order, all 15): Candidate Name, Job Role, Recruiter,
  Resume Upload Date, Total Experience, Relevant Experience, Current Location,
  Current Salary, Expected Salary, Notice Period, Last Working Day, Candidate
  Status, Job Status, Interview Date, Offer Status. A `?columns=` subset (or a
  saved config's `columns`) selects/reorders; default is all 15.
- **Date filters**: Today, Yesterday, This Week, Last Week, This Month, Last
  Month, This Year, Custom Date Range (weeks start Monday, resolved in the
  project timezone). The range is applied to the **candidate's most recent
  resume-upload date** (which is also the "Resume Upload Date" column, so filter
  and display stay consistent); candidates with no resume are excluded from a
  date-filtered report.
- **Efficient**: one query at the `CandidateJobMapping` grain —
  `select_related(candidate, job, offer)` plus `Max()` aggregates for the latest
  interview date and resume-upload date (no N+1). Well within the 30s budget.
- Generators are styled: Excel (frozen/styled header, title + timestamp,
  auto widths), CSV (utf-8-sig), PDF (landscape, repeating header, page breaks).

## Notifications (Module 10)

In-app notifications are created automatically by signals (`core/signals.py`) on
the five BRD triggers and exposed read-only via `/api/notifications/`:

| Trigger | Fires on |
|---|---|
| Resume Uploaded | `Resume` created |
| Candidate Tagged | `CandidateJobMapping` created |
| Interview Scheduled | `Interview` created **with** an `interview_date` |
| Offer Released | `Offer.offer_status` transitions **into** `RELEASED` |
| Candidate Joined | `Candidate.candidate_status` transitions **into** `JOINED` |

Duplicate-avoidance: Interview Scheduled fires only on interview creation (not
also on a candidate status change to *Interview Scheduled*); Offer Released and
Candidate Joined fire only on the *transition into* the target state (reusing the
audit `pre_save` old-value snapshot). Creation is deferred to
`transaction.on_commit` and defensively wrapped, so a notification failure can
never roll back or break the underlying save.

> **Migration required.** Module 10 adds a **new `Notification` table**. Because
> migrations are generated (not hand-authored) in this project, run:
>
> ```powershell
> python manage.py makemigrations core   # creates the Notification migration
> python manage.py migrate
> ```
>
> No other model changed; Reports (Module 8) added no fields.

## Deliberately deferred (later tasks)

- React frontend.
