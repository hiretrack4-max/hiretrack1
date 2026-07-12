import { useEffect, useRef, useState } from 'react';
import { Button, Chip, Drawer, Section, Select } from '@/components/ui';
import { EMPLOYMENT_TYPE_OPTIONS, JOB_STATUS_OPTIONS } from '@/constants/choices';
import {
  useCreateJob,
  useJobActions,
  useParseJobDescription,
  useUpdateJob,
} from '@/hooks/useJobs';
import { useMappings } from '@/hooks/useMappings';
import { useToast } from '@/context/ToastContext';
import { apiErrorMessage } from '@/lib/apiError';
import { formatDate } from '@/lib/format';
import type { EmploymentType, Job, JobInput, JobStatus } from '@/types/api';

/** Auto-filled fields — parsed from the JD unless the user has typed into them. */
type AutoKey = 'location' | 'number_of_openings' | 'salary_min' | 'salary_max';

interface FormState {
  job_role: string;
  department: string;
  summary: string;
  location: string;
  experience_min_years: string;
  experience_max_years: string;
  salary_min: string;
  salary_max: string;
  salary_currency: string;
  number_of_openings: string;
  employment_type: EmploymentType;
  job_status: JobStatus;
}

function initialForm(job: Job | null): FormState {
  return {
    job_role: job?.job_role ?? '',
    department: job?.department ?? '',
    summary: job?.description?.summary ?? '',
    location: job?.location ?? '',
    experience_min_years: job?.experience_min_years ?? '',
    experience_max_years: job?.experience_max_years ?? '',
    salary_min: job?.salary_min ?? '',
    salary_max: job?.salary_max ?? '',
    salary_currency: job?.salary_currency ?? 'INR',
    number_of_openings: job ? String(job.number_of_openings) : '',
    employment_type: job?.employment_type ?? 'FULL_TIME',
    job_status: job?.job_status ?? 'OPEN',
  };
}

export interface JobDrawerProps {
  open: boolean;
  /** The job to view/edit, or null to create a new one. */
  job: Job | null;
  onClose: () => void;
  /** Open a tagged candidate (cross-navigation). */
  onOpenCandidate?: (candidateId: number) => void;
}

export function JobDrawer({ open, job, onClose, onOpenCandidate }: JobDrawerProps) {
  const isNew = !job;
  const toast = useToast();
  const parse = useParseJobDescription();
  const createJob = useCreateJob();
  const updateJob = useUpdateJob(job?.id ?? 0);
  const { remove } = useJobActions(job?.id ?? 0);

  const [tab, setTab] = useState<'view' | 'paste'>(isNew ? 'paste' : 'view');
  const [form, setForm] = useState<FormState>(() => initialForm(job));
  const [roleError, setRoleError] = useState(false);
  const touched = useRef<Set<AutoKey>>(new Set());

  // Re-seed whenever the drawer opens for a different job (or create).
  useEffect(() => {
    if (!open) return;
    setForm(initialForm(job));
    setTab(job ? 'view' : 'paste');
    setRoleError(false);
    // Existing non-empty auto values count as "already decided".
    const seeded = new Set<AutoKey>();
    if (job?.location) seeded.add('location');
    if (job && job.number_of_openings) seeded.add('number_of_openings');
    if (job?.salary_min) seeded.add('salary_min');
    if (job?.salary_max) seeded.add('salary_max');
    touched.current = seeded;
  }, [open, job]);

  const { data: mappings } = useMappings({ job: job?.id });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const markTouched = (key: AutoKey, value: string) => {
    if (value.trim()) touched.current.add(key);
    else touched.current.delete(key);
  };

  const refill = (description: string) => {
    const text = description.trim();
    if (!text) return;
    parse.mutate(text, {
      onSuccess: (p) => {
        setForm((prev) => {
          const next = { ...prev };
          if (!touched.current.has('location') && p.location) next.location = p.location;
          if (!touched.current.has('number_of_openings') && p.number_of_openings != null)
            next.number_of_openings = String(p.number_of_openings);
          if (!touched.current.has('salary_min') && p.salary_min != null)
            next.salary_min = String(p.salary_min);
          if (!touched.current.has('salary_max') && p.salary_max != null)
            next.salary_max = String(p.salary_max);
          if (p.salary_currency) next.salary_currency = p.salary_currency;
          return next;
        });
      },
    });
  };

  const save = () => {
    if (!form.summary.trim()) {
      toast.error('Paste the job description first.');
      setTab('paste');
      return;
    }
    if (!form.job_role.trim()) {
      toast.error('Enter the job role.');
      setTab('paste');
      setRoleError(true);
      return;
    }
    if (!form.department.trim()) {
      toast.error('Enter the department.');
      setTab('paste');
      return;
    }

    const payload: JobInput = {
      job_role: form.job_role.trim(),
      department: form.department.trim(),
      hiring_manager: job?.hiring_manager ?? '',
      experience_min_years: form.experience_min_years.trim() || '0',
      experience_max_years: form.experience_max_years.trim() || null,
      location: form.location.trim(),
      employment_type: form.employment_type,
      number_of_openings: Number(form.number_of_openings) || 1,
      salary_min: form.salary_min.trim() || null,
      salary_max: form.salary_max.trim() || null,
      salary_currency: form.salary_currency.trim() || 'INR',
      job_status: form.job_status,
      description: {
        summary: form.summary.trim(),
        responsibilities: job?.description?.responsibilities ?? '',
        required_skills: job?.description?.required_skills ?? '',
        qualifications: job?.description?.qualifications ?? '',
        benefits: job?.description?.benefits ?? '',
      },
    };

    const opts = {
      onSuccess: () => {
        toast.success(isNew ? 'Job role created.' : 'Job role updated.');
        onClose();
      },
      onError: (err: unknown) => toast.error('Could not save job', apiErrorMessage(err)),
    };
    if (isNew) createJob.mutate(payload, opts);
    else updateJob.mutate(payload, opts);
  };

  const del = () => {
    if (!job) return;
    if (!window.confirm('Delete this job role? Candidates stay, but lose this tag.')) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        toast.success('Job role deleted.');
        onClose();
      },
      onError: (err) => toast.error('Delete failed', apiErrorMessage(err)),
    });
  };

  const saving = createJob.isPending || updateJob.isPending;

  const footer = (
    <>
      <div>
        {!isNew && (
          <Button variant="danger" onClick={del} loading={remove.isPending}>
            Delete
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} loading={saving}>
          {isNew ? 'Create job role' : 'Save changes'}
        </Button>
      </div>
    </>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow={isNew ? 'NEW JOB DESCRIPTION' : job?.job_id}
      title={isNew ? 'Add JD' : job?.job_role}
      footer={footer}
      ariaLabel="Job description"
    >
      <div className="dtabs">
        {!isNew && (
          <button className={tab === 'view' ? 'on' : ''} onClick={() => setTab('view')}>
            Formatted JD
          </button>
        )}
        <button className={tab === 'paste' ? 'on' : ''} onClick={() => setTab('paste')}>
          Paste &amp; edit
        </button>
      </div>

      {tab === 'view' && job ? (
        <JobFormattedView
          job={job}
          mappings={mappings ?? []}
          onOpenCandidate={onOpenCandidate}
        />
      ) : (
        <PasteEdit
          form={form}
          set={set}
          roleError={roleError}
          clearRoleError={() => setRoleError(false)}
          markTouched={markTouched}
          refill={refill}
          parsing={parse.isPending}
        />
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------------------

function JobFormattedView({
  job,
  mappings,
  onOpenCandidate,
}: {
  job: Job;
  mappings: { id: number; candidate: number; candidate_name: string; mapping_status: string }[];
  onOpenCandidate?: (id: number) => void;
}) {
  const rows: [string, string, boolean?][] = [
    ['Role', job.job_role, true],
    ['Job ID', job.job_id],
    ['Department', job.department],
    ['Location', job.location],
    ['Experience', formatExp(job.experience_min_years, job.experience_max_years)],
    ['Salary range', formatSalary(job.salary_min, job.salary_max, job.salary_currency)],
    ['Openings', String(job.number_of_openings)],
    ['Posted on', formatDate(job.created_at)],
    ...(job.closed_at ? ([['Closed on', formatDate(job.closed_at)]] as [string, string][]) : []),
  ];
  const body = job.description?.summary?.trim();

  return (
    <div>
      <div className="jd-rows">
        {rows
          .filter(([, v]) => v)
          .map(([k, v, head]) => (
            <div className={`jd-row ${head ? 'head' : ''}`} key={k}>
              <div className="jd-k">{k}</div>
              <div className="jd-v">{v}</div>
            </div>
          ))}
        <div className="jd-row">
          <div className="jd-k">Status</div>
          <div className="jd-v">
            <Chip status={job.job_status} />
          </div>
        </div>
      </div>

      {body ? (
        <div className="jd-body">{body}</div>
      ) : (
        <div className="jd-body" style={{ color: 'var(--dim)' }}>
          No description text on file.
        </div>
      )}

      {mappings.length > 0 && (
        <>
          <Section>Tagged candidates · {mappings.length}</Section>
          <table className="tbl">
            <tbody>
              {mappings.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 500 }}>{m.candidate_name}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Chip status={m.mapping_status} />
                  </td>
                  <td style={{ width: 70, textAlign: 'right' }}>
                    <Button variant="ghost" size="sm" onClick={() => onOpenCandidate?.(m.candidate)}>
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function PasteEdit({
  form,
  set,
  roleError,
  clearRoleError,
  markTouched,
  refill,
  parsing,
}: {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  roleError: boolean;
  clearRoleError: () => void;
  markTouched: (key: AutoKey, value: string) => void;
  refill: (description: string) => void;
  parsing: boolean;
}) {
  return (
    <div>
      <Section first>The job description</Section>

      <div className="field wide" style={{ marginBottom: 16 }}>
        <label className="field-label">
          Job role <span className="manual">required</span>
        </label>
        <input
          className={`inp${roleError ? ' field-err' : ''}`}
          value={form.job_role}
          placeholder="Type the role, e.g. Software Development Engineer"
          autoComplete="off"
          onChange={(e) => {
            set('job_role', e.target.value);
            if (roleError) clearRoleError();
          }}
        />
      </div>

      <div className="field wide">
        <label className="field-label">Description</label>
        <textarea
          className="txta"
          style={{ minHeight: 240, fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.7 }}
          value={form.summary}
          placeholder={'Paste the whole job description here.\n\nLocation, openings and salary are read out of it automatically.'}
          onChange={(e) => set('summary', e.target.value)}
          onBlur={(e) => refill(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            // Let the value settle, then re-derive off the full field.
            window.setTimeout(() => refill(text || form.summary), 0);
          }}
        />
        <p className="field-hint">
          Location, openings and salary are pulled from this text unless you have typed over them.
          The job role and department are always yours to enter.
        </p>
      </div>

      <Section>
        Read from the description <span className="auto">auto</span>
        {parsing && <span className="spin" style={{ marginLeft: 4 }} />}
      </Section>
      <div className="fgrid">
        <div className="field">
          <label className="field-label">Location</label>
          <input
            className="inp"
            value={form.location}
            placeholder="Not found"
            onChange={(e) => {
              set('location', e.target.value);
              markTouched('location', e.target.value);
            }}
          />
        </div>
        <div className="field">
          <label className="field-label">No. of openings</label>
          <input
            className="inp"
            type="number"
            min={1}
            value={form.number_of_openings}
            placeholder="1"
            onChange={(e) => {
              set('number_of_openings', e.target.value);
              markTouched('number_of_openings', e.target.value);
            }}
          />
        </div>
        <div className="field">
          <label className="field-label">Salary min ({form.salary_currency})</label>
          <input
            className="inp"
            type="number"
            value={form.salary_min}
            placeholder="Not found"
            onChange={(e) => {
              set('salary_min', e.target.value);
              markTouched('salary_min', e.target.value);
            }}
          />
        </div>
        <div className="field">
          <label className="field-label">Salary max ({form.salary_currency})</label>
          <input
            className="inp"
            type="number"
            value={form.salary_max}
            placeholder="Not found"
            onChange={(e) => {
              set('salary_max', e.target.value);
              markTouched('salary_max', e.target.value);
            }}
          />
        </div>
      </div>

      <Section>
        Enter yourself <span className="manual">manual</span>
      </Section>
      <div className="fgrid">
        <div className="field">
          <label className="field-label">
            Department <span className="manual">required</span>
          </label>
          <input
            className="inp"
            value={form.department}
            placeholder="e.g. Engineering"
            onChange={(e) => set('department', e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label">Experience min (yrs)</label>
          <input
            className="inp"
            type="number"
            step="0.1"
            min={0}
            value={form.experience_min_years}
            placeholder="0"
            onChange={(e) => set('experience_min_years', e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label">Experience max (yrs)</label>
          <input
            className="inp"
            type="number"
            step="0.1"
            min={0}
            value={form.experience_max_years}
            placeholder="—"
            onChange={(e) => set('experience_max_years', e.target.value)}
          />
        </div>
        <Select
          label="Employment type"
          options={EMPLOYMENT_TYPE_OPTIONS}
          value={form.employment_type}
          onChange={(e) => set('employment_type', e.target.value as EmploymentType)}
        />
        <Select
          label="Job status"
          options={JOB_STATUS_OPTIONS}
          value={form.job_status}
          onChange={(e) => set('job_status', e.target.value as JobStatus)}
        />
      </div>
      <p className="field-hint" style={{ marginTop: 8 }}>
        Openings feeds the weekly / monthly / yearly openings report. Setting status to Closed
        stamps the close date.
      </p>
    </div>
  );
}

function formatExp(min: string | null, max: string | null): string {
  const lo = min && Number(min) ? String(Number(min)) : min === '0' ? '0' : min;
  if (lo && max) return `${Number(min)}–${Number(max)} yrs`;
  if (lo) return `${Number(min)}+ yrs`;
  return '';
}

function formatSalary(min: string | null, max: string | null, currency: string): string {
  const fmt = (v: string) => `${currency} ${Number(v).toLocaleString('en-IN')}`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  if (min) return `From ${fmt(min)}`;
  if (max) return `Up to ${fmt(max)}`;
  return '';
}

export default JobDrawer;
