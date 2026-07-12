import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Coins, MapPin, Plus, Search, Users } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Pagination } from '@/components/common/Pagination';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  Skeleton,
  StatusPill,
} from '@/components/ui';
import { EMPLOYMENT_TYPE_OPTIONS, JOB_STATUS_OPTIONS } from '@/constants/choices';
import { useJobs } from '@/hooks/useJobs';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatExperience, formatSalaryRange } from '@/lib/format';
import { JobFormModal } from './JobFormModal';
import type { Job } from '@/types/api';

const EMPLOYMENT_LABEL: Record<string, string> = Object.fromEntries(
  EMPLOYMENT_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

const ARCHIVE_OPTIONS = [
  { value: 'false', label: 'Active only' },
  { value: 'true', label: 'Archived only' },
];

export default function JobsList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [jobStatus, setJobStatus] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [department, setDepartment] = useState('');
  const [archived, setArchived] = useState('false');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading, isError, refetch } = useJobs({
    page,
    search: debouncedSearch,
    job_status: jobStatus,
    employment_type: employmentType,
    department,
    is_archived: archived,
  });

  // Derive department options from the current page (best-effort convenience).
  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    (data?.results ?? []).forEach((j) => j.department && set.add(j.department));
    if (department) set.add(department);
    return [...set].sort().map((d) => ({ value: d, label: d }));
  }, [data, department]);

  const resetPage = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Requisitions"
        eyebrowIcon={Briefcase}
        title="Jobs"
        description="Create, track and archive hiring requisitions."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New Job
          </Button>
        }
      />

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-1">
            <Input
              placeholder="Search jobs…"
              value={search}
              onChange={(e) => resetPage(setSearch)(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
            />
          </div>
          <Select
            options={JOB_STATUS_OPTIONS}
            placeholder="All statuses"
            value={jobStatus}
            onChange={(e) => resetPage(setJobStatus)(e.target.value)}
          />
          <Select
            options={EMPLOYMENT_TYPE_OPTIONS}
            placeholder="All types"
            value={employmentType}
            onChange={(e) => resetPage(setEmploymentType)(e.target.value)}
          />
          <Select
            options={departmentOptions}
            placeholder="All departments"
            value={department}
            onChange={(e) => resetPage(setDepartment)(e.target.value)}
          />
          <Select
            options={ARCHIVE_OPTIONS}
            value={archived}
            onChange={(e) => resetPage(setArchived)(e.target.value)}
          />
        </div>
      </Card>

      {isError ? (
        <Card className="p-4 text-sm text-status-rejected">
          Couldn't load jobs.{' '}
          <button onClick={() => refetch()} className="font-semibold underline">
            Retry
          </button>
        </Card>
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : (data?.results.length ?? 0) === 0 ? (
        <Card>
          <EmptyState
            icon={<Briefcase className="h-7 w-7" />}
            title="No jobs found"
            description="Try adjusting your filters, or create your first requisition."
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                New Job
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {(data?.results ?? []).map((job) => (
              <JobCard key={job.id} job={job} onOpen={() => navigate(`/jobs/${job.id}`)} />
            ))}
          </div>
          {data && data.count > 0 && (
            <Pagination count={data.count} page={page} onPageChange={setPage} />
          )}
        </>
      )}

      <JobFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={(job) => navigate(`/jobs/${job.id}`)}
      />
    </div>
  );
}

function JobCard({ job, onOpen }: { job: Job; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full flex-col rounded-2xl border border-line bg-card p-5 text-left shadow-card transition-all duration-200 ease-smooth hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/12 text-brand-600 transition-colors group-hover:bg-brand-gradient group-hover:text-white dark:text-brand-300">
          <Briefcase className="h-5 w-5" />
        </span>
        <StatusPill status={job.job_status} />
      </div>

      <p className="mt-4 text-2xs font-semibold uppercase tracking-wide text-muted">{job.job_id}</p>
      <h3 className="mt-0.5 line-clamp-2 text-base font-semibold text-ink">{job.job_role}</h3>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{EMPLOYMENT_LABEL[job.employment_type] ?? job.employment_type}</Badge>
        {job.department && <Badge tone="neutral">{job.department}</Badge>}
        {job.is_archived && <Badge tone="neutral">Archived</Badge>}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-2xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" />
          {job.location || '—'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Coins className="h-3.5 w-3.5" />
          {formatSalaryRange(job.salary_min, job.salary_max, job.salary_currency)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          {formatExperience(job.experience_min_years, job.experience_max_years)}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
          <Users className="h-4 w-4 text-brand-500" />
          {job.candidate_count} candidate{job.candidate_count === 1 ? '' : 's'}
        </span>
        <span className="text-xs font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-brand-300">
          View →
        </span>
      </div>
    </button>
  );
}
