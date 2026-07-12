import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Wand2 } from 'lucide-react';
import { Button, Input, Modal, Select, Spinner, Textarea } from '@/components/ui';
import { EMPLOYMENT_TYPE_OPTIONS, JOB_STATUS_OPTIONS } from '@/constants/choices';
import { useCreateJob, useParseJobDescription, useUpdateJob } from '@/hooks/useJobs';
import { useToast } from '@/context/ToastContext';
import { apiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/utils';
import type { EmploymentType, Job, JobInput, JobStatus } from '@/types/api';

interface JobFormState {
  job_role: string;
  department: string;
  hiring_manager: string;
  location: string;
  employment_type: EmploymentType;
  number_of_openings: string;
  experience_min_years: string;
  experience_max_years: string;
  salary_min: string;
  salary_max: string;
  salary_currency: string;
  job_status: JobStatus;
  summary: string;
  responsibilities: string;
  required_skills: string;
  qualifications: string;
  benefits: string;
}

function blankState(): JobFormState {
  return {
    job_role: '',
    department: '',
    hiring_manager: '',
    location: '',
    employment_type: 'FULL_TIME',
    number_of_openings: '1',
    experience_min_years: '0',
    experience_max_years: '',
    salary_min: '',
    salary_max: '',
    salary_currency: 'INR',
    job_status: 'OPEN',
    summary: '',
    responsibilities: '',
    required_skills: '',
    qualifications: '',
    benefits: '',
  };
}

function fromJob(job: Job): JobFormState {
  return {
    job_role: job.job_role,
    department: job.department,
    hiring_manager: job.hiring_manager,
    location: job.location,
    employment_type: job.employment_type,
    number_of_openings: String(job.number_of_openings),
    experience_min_years: job.experience_min_years ?? '0',
    experience_max_years: job.experience_max_years ?? '',
    salary_min: job.salary_min ?? '',
    salary_max: job.salary_max ?? '',
    salary_currency: job.salary_currency || 'INR',
    job_status: job.job_status,
    summary: job.description?.summary ?? '',
    responsibilities: job.description?.responsibilities ?? '',
    required_skills: job.description?.required_skills ?? '',
    qualifications: job.description?.qualifications ?? '',
    benefits: job.description?.benefits ?? '',
  };
}

export interface JobFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Provide a job to edit; omit for a create form. */
  job?: Job | null;
  onSaved?: (job: Job) => void;
}

export function JobFormModal({ open, onClose, job, onSaved }: JobFormModalProps) {
  const toast = useToast();
  const isEdit = Boolean(job);
  const [form, setForm] = useState<JobFormState>(blankState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Create-flow: reveal the extracted fields once the JD has been parsed.
  const [revealed, setRevealed] = useState(false);
  const lastParsed = useRef('');

  const createJob = useCreateJob();
  const updateJob = useUpdateJob(job?.id ?? 0);
  const parseJd = useParseJobDescription();
  const saving = createJob.isPending || updateJob.isPending;

  // Reset the form whenever the modal opens (or the target job changes).
  useEffect(() => {
    if (open) {
      setForm(job ? fromJob(job) : blankState());
      setErrors({});
      setRevealed(Boolean(job));
      lastParsed.current = '';
    }
  }, [open, job]);

  const set = <K extends keyof JobFormState>(key: K, value: JobFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // --- Create-flow: extract structured fields from the pasted JD -----------
  const runExtract = () => {
    const text = form.summary.trim();
    if (!text) return;
    if (text === lastParsed.current) {
      setRevealed(true);
      return;
    }
    lastParsed.current = text;
    parseJd.mutate(text, {
      onSuccess: (r) => {
        setForm((prev) => ({
          ...prev,
          location: r.location ?? prev.location,
          number_of_openings:
            r.number_of_openings != null ? String(r.number_of_openings) : prev.number_of_openings,
          salary_min: r.salary_min != null ? String(r.salary_min) : prev.salary_min,
          salary_max: r.salary_max != null ? String(r.salary_max) : prev.salary_max,
          salary_currency: r.salary_currency ?? prev.salary_currency,
        }));
        setRevealed(true);
      },
      onError: (err) => {
        // Still reveal so HR can fill the fields by hand.
        setRevealed(true);
        toast.error('Could not auto-extract', apiErrorMessage(err));
      },
    });
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.job_role.trim()) next.job_role = 'Job role is required.';
    if (!form.department.trim()) next.department = 'Department is required.';
    if (!form.location.trim()) next.location = 'Location is required.';

    const openings = Number(form.number_of_openings);
    if (!Number.isInteger(openings) || openings < 1)
      next.number_of_openings = 'Enter a whole number ≥ 1.';

    if (isEdit) {
      const expMin = form.experience_min_years === '' ? 0 : Number(form.experience_min_years);
      const expMax = form.experience_max_years === '' ? null : Number(form.experience_max_years);
      if (Number.isNaN(expMin) || expMin < 0) next.experience_min_years = 'Invalid value.';
      if (expMax !== null && (Number.isNaN(expMax) || expMax < 0))
        next.experience_max_years = 'Invalid value.';
      if (expMax !== null && !Number.isNaN(expMin) && expMax < expMin)
        next.experience_max_years = 'Max must be ≥ min.';
    }

    const salMin = form.salary_min === '' ? null : Number(form.salary_min);
    const salMax = form.salary_max === '' ? null : Number(form.salary_max);
    if (salMin !== null && (Number.isNaN(salMin) || salMin < 0)) next.salary_min = 'Invalid value.';
    if (salMax !== null && (Number.isNaN(salMax) || salMax < 0)) next.salary_max = 'Invalid value.';
    if (salMin !== null && salMax !== null && salMax < salMin)
      next.salary_max = 'Max must be ≥ min.';

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const buildPayload = (): JobInput => ({
    job_role: form.job_role.trim(),
    department: form.department.trim(),
    hiring_manager: form.hiring_manager.trim(),
    location: form.location.trim(),
    employment_type: form.employment_type,
    number_of_openings: Number(form.number_of_openings) || 1,
    experience_min_years: form.experience_min_years === '' ? '0' : form.experience_min_years,
    experience_max_years: form.experience_max_years === '' ? null : form.experience_max_years,
    salary_min: form.salary_min === '' ? null : form.salary_min,
    salary_max: form.salary_max === '' ? null : form.salary_max,
    salary_currency: form.salary_currency.trim().toUpperCase() || 'INR',
    job_status: form.job_status,
    description: {
      summary: form.summary,
      responsibilities: form.responsibilities,
      required_skills: form.required_skills,
      qualifications: form.qualifications,
      benefits: form.benefits,
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      // In the create flow the required extras live in the revealed panel.
      if (!isEdit) setRevealed(true);
      return;
    }
    const payload = buildPayload();

    const onDone = (saved: Job, label: string) => {
      toast.success(label, `${saved.job_id} · ${saved.job_role}`);
      onSaved?.(saved);
      onClose();
    };

    if (isEdit && job) {
      updateJob.mutate(payload, {
        onSuccess: (saved) => onDone(saved, 'Job updated'),
        onError: (err) => toast.error('Could not update job', apiErrorMessage(err)),
      });
    } else {
      createJob.mutate(payload, {
        onSuccess: (saved) => onDone(saved, 'Job created'),
        onError: (err) => toast.error('Could not create job', apiErrorMessage(err)),
      });
    }
  };

  const footer = useMemo(
    () => (
      <>
        <Button variant="ghost" type="button" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" form="job-form" loading={saving}>
          {isEdit ? 'Save changes' : 'Create job'}
        </Button>
      </>
    ),
    [onClose, saving, isEdit],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Edit job' : 'New job'}
      description={
        isEdit
          ? 'Update this requisition and its description.'
          : 'Enter a role and paste the JD — we’ll extract the rest.'
      }
      footer={footer}
    >
      <form
        id="job-form"
        onSubmit={handleSubmit}
        className="max-h-[65vh] space-y-6 overflow-y-auto pr-1"
      >
        {isEdit ? (
          <EditFields form={form} set={set} errors={errors} />
        ) : (
          <CreateFields
            form={form}
            set={set}
            errors={errors}
            revealed={revealed}
            extracting={parseJd.isPending}
            onExtract={runExtract}
          />
        )}
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Simplified create flow: 2 fields + auto-populated extras
// ---------------------------------------------------------------------------
function CreateFields({
  form,
  set,
  errors,
  revealed,
  extracting,
  onExtract,
}: {
  form: JobFormState;
  set: <K extends keyof JobFormState>(key: K, value: JobFormState[K]) => void;
  errors: Record<string, string>;
  revealed: boolean;
  extracting: boolean;
  onExtract: () => void;
}) {
  return (
    <div className="space-y-6">
      <Input
        label="Job role *"
        value={form.job_role}
        onChange={(e) => set('job_role', e.target.value)}
        error={errors.job_role}
        placeholder="e.g. Senior Backend Engineer"
      />

      <div>
        <Textarea
          label="Job description *"
          value={form.summary}
          onChange={(e) => set('summary', e.target.value)}
          onBlur={onExtract}
          className="min-h-[160px]"
          placeholder="Paste the full job description here — location, openings and salary are extracted automatically."
        />
        <div className="mt-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-2xs text-muted">
            {extracting ? (
              <>
                <Spinner className="h-3.5 w-3.5" /> Extracting details…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 text-brand-500" />
                Fields auto-fill from the description.
              </>
            )}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onExtract}
            disabled={extracting || !form.summary.trim()}
          >
            <Wand2 className="h-4 w-4" />
            Extract details
          </Button>
        </div>
      </div>

      <div
        className={cn(
          'space-y-4 border-t border-line pt-5 transition-opacity',
          revealed ? 'opacity-100' : 'pointer-events-none opacity-40',
        )}
      >
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          Auto-filled details
          <span className="text-2xs font-normal text-muted">· edit before saving</span>
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Location *"
            value={form.location}
            onChange={(e) => set('location', e.target.value)}
            error={errors.location}
            placeholder="e.g. Bengaluru / Remote"
          />
          <Input
            label="Department *"
            value={form.department}
            onChange={(e) => set('department', e.target.value)}
            error={errors.department}
            placeholder="e.g. Engineering"
          />
          <Input
            label="Vacancies / Open positions"
            type="number"
            min={1}
            value={form.number_of_openings}
            onChange={(e) => set('number_of_openings', e.target.value)}
            error={errors.number_of_openings}
          />
          <Input
            label="Currency"
            value={form.salary_currency}
            maxLength={3}
            onChange={(e) => set('salary_currency', e.target.value.toUpperCase())}
            placeholder="INR"
          />
          <Input
            label="Min salary"
            type="number"
            min={0}
            value={form.salary_min}
            onChange={(e) => set('salary_min', e.target.value)}
            error={errors.salary_min}
          />
          <Input
            label="Max salary"
            type="number"
            min={0}
            value={form.salary_max}
            onChange={(e) => set('salary_max', e.target.value)}
            error={errors.salary_max}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full edit form (unchanged field set)
// ---------------------------------------------------------------------------
function EditFields({
  form,
  set,
  errors,
}: {
  form: JobFormState;
  set: <K extends keyof JobFormState>(key: K, value: JobFormState[K]) => void;
  errors: Record<string, string>;
}) {
  return (
    <>
      {/* Core */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Job role *"
          value={form.job_role}
          onChange={(e) => set('job_role', e.target.value)}
          error={errors.job_role}
          placeholder="e.g. Senior Backend Engineer"
        />
        <Input
          label="Department *"
          value={form.department}
          onChange={(e) => set('department', e.target.value)}
          error={errors.department}
          placeholder="e.g. Engineering"
        />
        <Input
          label="Hiring manager"
          value={form.hiring_manager}
          onChange={(e) => set('hiring_manager', e.target.value)}
          placeholder="e.g. Priya Sharma"
        />
        <Input
          label="Location *"
          value={form.location}
          onChange={(e) => set('location', e.target.value)}
          error={errors.location}
          placeholder="e.g. Bengaluru / Remote"
        />
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

      {/* Ranges */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Input
          label="Openings"
          type="number"
          min={1}
          value={form.number_of_openings}
          onChange={(e) => set('number_of_openings', e.target.value)}
          error={errors.number_of_openings}
        />
        <Input
          label="Min experience (yrs)"
          type="number"
          min={0}
          step="0.5"
          value={form.experience_min_years}
          onChange={(e) => set('experience_min_years', e.target.value)}
          error={errors.experience_min_years}
        />
        <Input
          label="Max experience (yrs)"
          type="number"
          min={0}
          step="0.5"
          value={form.experience_max_years}
          onChange={(e) => set('experience_max_years', e.target.value)}
          error={errors.experience_max_years}
        />
        <Input
          label="Min salary"
          type="number"
          min={0}
          value={form.salary_min}
          onChange={(e) => set('salary_min', e.target.value)}
          error={errors.salary_min}
        />
        <Input
          label="Max salary"
          type="number"
          min={0}
          value={form.salary_max}
          onChange={(e) => set('salary_max', e.target.value)}
          error={errors.salary_max}
        />
        <Input
          label="Currency"
          value={form.salary_currency}
          maxLength={3}
          onChange={(e) => set('salary_currency', e.target.value.toUpperCase())}
          placeholder="INR"
        />
      </div>

      {/* Description */}
      <div className="space-y-4 border-t border-line pt-5">
        <p className="text-sm font-semibold text-ink">Job description</p>
        <Textarea
          label="Summary"
          value={form.summary}
          onChange={(e) => set('summary', e.target.value)}
          placeholder="A short overview of the role…"
        />
        <Textarea
          label="Responsibilities"
          value={form.responsibilities}
          onChange={(e) => set('responsibilities', e.target.value)}
        />
        <Textarea
          label="Required skills"
          value={form.required_skills}
          onChange={(e) => set('required_skills', e.target.value)}
          placeholder="Comma-separated, e.g. Python, Django, PostgreSQL"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Textarea
            label="Qualifications"
            value={form.qualifications}
            onChange={(e) => set('qualifications', e.target.value)}
          />
          <Textarea
            label="Benefits"
            value={form.benefits}
            onChange={(e) => set('benefits', e.target.value)}
          />
        </div>
      </div>
    </>
  );
}
