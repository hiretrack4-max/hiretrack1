import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Archive,
  ArchiveRestore,
  Briefcase,
  Building2,
  CalendarDays,
  Coins,
  MapPin,
  Pencil,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { MappingModal } from '@/components/mappings/MappingModal';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Select,
  Skeleton,
  StatusPill,
} from '@/components/ui';
import { EMPLOYMENT_TYPE_OPTIONS, JOB_STATUS_OPTIONS } from '@/constants/choices';
import { useJob, useJobActions, useUpdateJob } from '@/hooks/useJobs';
import { useMappings } from '@/hooks/useMappings';
import { useToast } from '@/context/ToastContext';
import { apiErrorMessage } from '@/lib/apiError';
import { formatDate, formatExperience, formatSalaryRange } from '@/lib/format';
import { JobFormModal } from './JobFormModal';

const EMPLOYMENT_LABEL: Record<string, string> = Object.fromEntries(
  EMPLOYMENT_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

export default function JobDetail() {
  const { id } = useParams();
  const jobId = Number(id);
  const navigate = useNavigate();
  const toast = useToast();

  const { data: job, isLoading, isError } = useJob(jobId);
  const { data: mappings } = useMappings({ job: jobId });
  const updateJob = useUpdateJob(jobId);
  const { archive, unarchive, remove } = useJobActions(jobId);

  const [editOpen, setEditOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | 'delete' | 'archive'>(null);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !job) {
    return (
      <Card className="p-8">
        <EmptyState
          icon={<Briefcase className="h-7 w-7" />}
          title="Job not found"
          description="This requisition may have been deleted."
          action={
            <Button variant="secondary" onClick={() => navigate('/jobs')}>
              Back to jobs
            </Button>
          }
        />
      </Card>
    );
  }

  const changeStatus = (job_status: string) => {
    updateJob.mutate(
      { job_status: job_status as typeof job.job_status },
      {
        onSuccess: () => toast.success('Status updated'),
        onError: (err) => toast.error('Could not update status', apiErrorMessage(err)),
      },
    );
  };

  const overview = [
    { icon: Building2, label: 'Department', value: job.department || '—' },
    { icon: Users, label: 'Hiring manager', value: job.hiring_manager || '—' },
    { icon: MapPin, label: 'Location', value: job.location || '—' },
    {
      icon: Briefcase,
      label: 'Employment',
      value: EMPLOYMENT_LABEL[job.employment_type] ?? job.employment_type,
    },
    { icon: Users, label: 'Openings', value: String(job.number_of_openings) },
    {
      icon: CalendarDays,
      label: 'Experience',
      value: formatExperience(job.experience_min_years, job.experience_max_years),
    },
    {
      icon: Coins,
      label: 'Salary',
      value: formatSalaryRange(job.salary_min, job.salary_max, job.salary_currency),
    },
    { icon: CalendarDays, label: 'Created', value: formatDate(job.created_at) },
  ];

  const skills = (job.description?.required_skills ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="space-y-6">
      <PageHeader
        back={
          <Link
            to="/jobs"
            className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to jobs
          </Link>
        }
        title={job.job_role}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            {job.is_archived ? (
              <Button
                variant="secondary"
                loading={unarchive.isPending}
                onClick={() =>
                  unarchive.mutate(undefined, {
                    onSuccess: () => toast.success('Job unarchived'),
                    onError: (err) => toast.error('Failed', apiErrorMessage(err)),
                  })
                }
              >
                <ArchiveRestore className="h-4 w-4" />
                Unarchive
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setConfirm('archive')}>
                <Archive className="h-4 w-4" />
                Archive
              </Button>
            )}
            <Button variant="ghost" onClick={() => setConfirm('delete')} aria-label="Delete job">
              <Trash2 className="h-4 w-4 text-status-rejected" />
            </Button>
          </>
        }
      />

      {/* Identity + status bar */}
      <Card className="relative overflow-hidden p-5">
        <div className="pointer-events-none absolute inset-0 bg-mesh-light" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-brand-sm">
              <Briefcase className="h-6 w-6" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-lg font-bold text-ink">{job.job_id}</span>
                <StatusPill status={job.job_status} />
                {job.is_archived && <Badge tone="neutral">Archived</Badge>}
              </div>
              <p className="mt-0.5 text-sm text-muted">
                {job.candidate_count} candidate{job.candidate_count === 1 ? '' : 's'} mapped
              </p>
            </div>
          </div>
          <div className="w-full sm:w-56">
            <Select
              label="Change status"
              options={JOB_STATUS_OPTIONS}
              value={job.job_status}
              onChange={(e) => changeStatus(e.target.value)}
              disabled={updateJob.isPending}
            />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: overview + description */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h3 className="mb-4 text-base font-semibold text-ink">Overview</h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {overview.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="space-y-1">
                    <p className="flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-muted">
                      <Icon className="h-3 w-3" />
                      {item.label}
                    </p>
                    <p className="text-[0.95rem] font-semibold leading-snug text-ink">{item.value}</p>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-4 text-base font-semibold text-ink">Job description</h3>
            <div className="space-y-5">
              <DescriptionBlock title="Summary" text={job.description?.summary} />
              <DescriptionBlock title="Responsibilities" text={job.description?.responsibilities} />
              {skills.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-semibold text-ink">Required skills</p>
                  <div className="flex flex-wrap gap-2">
                    {skills.map((skill) => (
                      <Badge key={skill} tone="brand">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <DescriptionBlock title="Qualifications" text={job.description?.qualifications} />
              <DescriptionBlock title="Benefits" text={job.description?.benefits} />
            </div>
          </Card>
        </div>

        {/* Right: mapped candidates */}
        <div className="space-y-6">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-ink">Candidates</h3>
              <Button
                size="sm"
                onClick={() => setMapOpen(true)}
                disabled={!job.is_open_for_mapping}
                title={
                  job.is_open_for_mapping
                    ? undefined
                    : 'This job is closed/archived and cannot accept new mappings.'
                }
              >
                <UserPlus className="h-4 w-4" />
                Add
              </Button>
            </div>

            {!job.is_open_for_mapping && (
              <p className="mb-3 rounded-xl border border-job-hold/30 bg-status-onhold/10 px-3 py-2 text-2xs font-medium text-status-onhold">
                This job is closed or archived. Reopen it to tag new candidates.
              </p>
            )}

            {mappings && mappings.length > 0 ? (
              <div className="space-y-2">
                {mappings.map((m) => (
                  <Link
                    key={m.id}
                    to={`/candidates/${m.candidate}`}
                    className="flex items-center gap-3 rounded-xl border border-line bg-surface/50 p-2.5 transition-colors hover:border-brand-300 hover:bg-card"
                  >
                    <Avatar name={m.candidate_name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{m.candidate_name}</p>
                      <p className="text-2xs text-muted">Applied {formatDate(m.applied_date)}</p>
                    </div>
                    <StatusPill status={m.mapping_status} dot={false} />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Users className="h-7 w-7" />}
                title="No candidates yet"
                description="Tag candidates to this job to start the pipeline."
              />
            )}
          </Card>
        </div>
      </div>

      <JobFormModal open={editOpen} onClose={() => setEditOpen(false)} job={job} />

      <MappingModal
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        mode={{ kind: 'for-job', job }}
      />

      <ConfirmDialog
        open={confirm === 'archive'}
        onClose={() => setConfirm(null)}
        title="Archive this job?"
        description="Archived jobs stop accepting new candidate mappings until reopened."
        confirmLabel="Archive"
        loading={archive.isPending}
        onConfirm={() =>
          archive.mutate(undefined, {
            onSuccess: () => {
              toast.success('Job archived');
              setConfirm(null);
            },
            onError: (err) => toast.error('Failed', apiErrorMessage(err)),
          })
        }
      />

      <ConfirmDialog
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        title="Delete this job?"
        description="The job moves to the Recycle Bin — you can restore it later from there."
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => {
              toast.success('Moved to Recycle Bin', job.job_role);
              navigate('/jobs');
            },
            onError: (err) => toast.error('Failed', apiErrorMessage(err)),
          })
        }
      />
    </div>
  );
}

function DescriptionBlock({ title, text }: { title: string; text?: string }) {
  if (!text?.trim()) return null;
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-ink">{title}</p>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{text}</p>
    </div>
  );
}
