-- ============================================================
--  HIRE TRACK — database schema
--  Run this once in Supabase → SQL Editor → New query → Run.
-- ============================================================

-- ---------- JOBS ----------
create table if not exists public.jobs (
  id           text primary key,              -- e.g. JOB-001 (kept from the app)
  role         text not null,
  jd           text default '',
  location     text default '',
  experience   text default '',
  salary       text default '',
  openings     text default '',
  status       text default 'Open',           -- Open / In Progress / On Hold / Closed
  created_at   timestamptz default now(),
  closed_at    timestamptz,
  owner        uuid default auth.uid()         -- the logged-in user who created it
);

-- ---------- CANDIDATES ----------
create table if not exists public.candidates (
  id                   text primary key,       -- e.g. CAN-001
  name                 text default '',
  email                text default '',
  phone                text default '',
  address              text default '',
  location             text default '',
  total_exp            text default '',
  relevant_exp         text default '',
  skills               jsonb default '[]',
  technologies         jsonb default '[]',
  current_company      text default '',
  current_designation  text default '',
  qualification        text default '',
  certifications       jsonb default '[]',
  stints               jsonb default '[]',
  current_fixed        text default '',
  current_variable     text default '',
  expected_salary      text default '',
  notice_period        integer default 0,
  last_working_day     text default '',
  status               text default 'Resume Received',
  job_ids              jsonb default '[]',     -- which jobs this candidate is tagged to
  recruiter            text default 'Avinash S',
  resume_name          text default '',
  resume_size          bigint default 0,
  resume_path          text default '',        -- path in the Storage bucket (not base64!)
  interview            jsonb default '{}',
  history              jsonb default '[]',
  flags                jsonb default '[]',
  uploaded_at          timestamptz default now(),
  last_status_at       timestamptz default now(),
  owner                uuid default auth.uid()
);

-- ---------- SEQUENCE COUNTERS ----------
-- keeps JOB-001 / CAN-001 style ids incrementing on the server
create table if not exists public.counters (
  name  text primary key,
  value integer default 0
);
insert into public.counters (name, value) values ('job', 0), ('cand', 0)
  on conflict (name) do nothing;

-- atomically bump and return the next number
create or replace function public.next_counter(counter_name text)
returns integer language plpgsql security definer as $$
declare n integer;
begin
  update public.counters set value = value + 1
    where name = counter_name returning value into n;
  return n;
end; $$;

-- ============================================================
--  ROW-LEVEL SECURITY
--  Every row is owned by the user who made it; only they can see it.
--  (With one login this simply means "must be signed in".)
-- ============================================================
alter table public.jobs       enable row level security;
alter table public.candidates enable row level security;
alter table public.counters   enable row level security;

-- jobs
create policy "own jobs - select" on public.jobs for select using (auth.uid() = owner);
create policy "own jobs - insert" on public.jobs for insert with check (auth.uid() = owner);
create policy "own jobs - update" on public.jobs for update using (auth.uid() = owner);
create policy "own jobs - delete" on public.jobs for delete using (auth.uid() = owner);

-- candidates
create policy "own cands - select" on public.candidates for select using (auth.uid() = owner);
create policy "own cands - insert" on public.candidates for insert with check (auth.uid() = owner);
create policy "own cands - update" on public.candidates for update using (auth.uid() = owner);
create policy "own cands - delete" on public.candidates for delete using (auth.uid() = owner);

-- counters: any signed-in user may read/bump
create policy "counters - all" on public.counters for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ============================================================
--  RESUME FILE STORAGE
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('resumes', 'resumes', false)
  on conflict (id) do nothing;

-- only signed-in users can read/write files, and only inside their own folder
create policy "resumes - read"   on storage.objects for select
  using (bucket_id = 'resumes' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "resumes - upload" on storage.objects for insert
  with check (bucket_id = 'resumes' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "resumes - delete" on storage.objects for delete
  using (bucket_id = 'resumes' and auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
--  DONE. Next: create your single login in Authentication → Users.
-- ============================================================
