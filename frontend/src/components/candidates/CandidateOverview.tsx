import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Briefcase,
  Building2,
  GraduationCap,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import { CandidateFormFields } from '@/components/candidates/CandidateFormFields';
import {
  buildCandidatePayload,
  candidateToForm,
  type CandidateFormState,
} from '@/components/candidates/candidateForm';
import { SKILL_TYPE_LABEL } from '@/constants/choices';
import { useUpdateCandidate } from '@/hooks/useCandidates';
import { useToast } from '@/context/ToastContext';
import { apiErrorMessage } from '@/lib/apiError';
import { formatDate, formatYears } from '@/lib/format';
import { formatLpa } from '@/lib/salary';
import { cn } from '@/lib/utils';
import type { Candidate } from '@/types/api';

export function CandidateOverview({ candidate }: { candidate: Candidate }) {
  const toast = useToast();
  const update = useUpdateCandidate(candidate.id);
  const [searchParams, setSearchParams] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<CandidateFormState>(() => candidateToForm(candidate));

  useEffect(() => {
    if (!editing) setForm(candidateToForm(candidate));
  }, [candidate, editing]);

  // Open straight into edit mode when arriving from the resume-upload screen
  // (…/candidates/:id?edit=1), then strip the flag so a refresh/back won't re-open it.
  useEffect(() => {
    if (searchParams.get('edit') === '1') {
      setEditing(true);
      searchParams.delete('edit');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof CandidateFormState>(key: K, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = () => {
    if (!form.full_name.trim()) {
      toast.error('Name required', 'A candidate must have a full name.');
      return;
    }
    update.mutate(buildCandidatePayload(form), {
      onSuccess: () => {
        toast.success('Profile updated');
        setEditing(false);
      },
      onError: (err) => toast.error('Could not update profile', apiErrorMessage(err)),
    });
  };

  if (editing) {
    return (
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink">Edit profile</h3>
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            <X className="h-4 w-4" />
            Cancel
          </Button>
        </div>
        <CandidateFormFields form={form} set={set} />
        <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={() => setEditing(false)} disabled={update.isPending}>
            Cancel
          </Button>
          <Button onClick={save} loading={update.isPending}>
            Save changes
          </Button>
        </div>
      </Card>
    );
  }

  const skillsByType = groupSkills(candidate);

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink">Profile</h3>
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Info icon={Mail} label="Email" value={candidate.email || '—'} />
          <Info icon={Phone} label="Mobile" value={candidate.mobile || '—'} />
          <Info icon={MapPin} label="Location" value={candidate.current_location || '—'} />
          <Info icon={Building2} label="Current company" value={candidate.current_company || '—'} />
          <Info icon={Briefcase} label="Designation" value={candidate.current_designation || '—'} />
          <Info icon={GraduationCap} label="Qualification" value={candidate.highest_qualification || '—'} />
          <Info label="Total experience" value={formatYears(candidate.total_experience_years)} />
          <Info label="Relevant experience" value={formatYears(candidate.relevant_experience_years)} />
          {candidate.address && <Info icon={MapPin} label="Address" value={candidate.address} />}
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Wallet className="h-4 w-4 text-brand-500" />
            Compensation (CTC · LPA)
          </h3>
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CtcCard
            title="Current CTC"
            fixed={candidate.current_ctc_fixed}
            variable={candidate.current_ctc_variable}
            total={candidate.current_ctc_total}
          />
          <CtcCard
            title="Expected CTC"
            fixed={candidate.expected_ctc_fixed}
            variable={candidate.expected_ctc_variable}
            total={candidate.expected_ctc_total}
            hike={candidate.hike_percent}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Info
            label="Notice period"
            value={candidate.notice_period_days !== null ? `${candidate.notice_period_days} days` : '—'}
          />
          <Info label="Last working day" value={formatDate(candidate.last_working_day)} />
        </div>
      </Card>

      {skillsByType.length > 0 && (
        <Card className="p-5">
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-ink">
            <Sparkles className="h-4 w-4 text-brand-500" />
            Skills
          </h3>
          <div className="space-y-4">
            {skillsByType.map(([type, names]) => (
              <div key={type}>
                <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-label">
                  {SKILL_TYPE_LABEL[type] ?? type}
                </p>
                <div className="flex flex-wrap gap-2">
                  {names.map((name) => (
                    <Badge key={name} tone="brand">
                      {name}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {candidate.experiences.length > 0 && (
        <Card className="p-5">
          <h3 className="mb-4 text-base font-semibold text-ink">Experience</h3>
          <ol className="relative space-y-5 pl-5">
            <span className="absolute left-[5px] top-1.5 h-[calc(100%-0.75rem)] w-px bg-line" />
            {candidate.experiences.map((exp) => (
              <li key={exp.id} className="relative">
                <span className="absolute -left-5 top-1 h-2.5 w-2.5 rounded-full bg-brand-gradient ring-4 ring-card" />
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-ink">
                    {exp.designation || 'Role'}{exp.company ? ` · ${exp.company}` : ''}
                  </p>
                  {exp.is_current && <Badge tone="success">Current</Badge>}
                </div>
                <p className="mt-0.5 text-2xs text-muted">
                  {formatDate(exp.start_date)} — {exp.is_current ? 'Present' : formatDate(exp.end_date)}
                </p>
                {exp.description && <p className="mt-1 text-sm text-muted">{exp.description}</p>}
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}

function CtcCard({
  title,
  fixed,
  variable,
  total,
  hike,
}: {
  title: string;
  fixed: string | null;
  variable: string | null;
  total: number | null;
  hike?: number | null;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {hike !== undefined && hike !== null && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
              hike >= 0
                ? 'bg-status-joined/12 text-status-joined'
                : 'bg-status-rejected/12 text-status-rejected',
            )}
          >
            {hike >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {hike >= 0 ? '+' : ''}
            {hike}% hike
          </span>
        )}
      </div>
      <p className="font-display text-2xl font-bold text-ink">{formatLpa(total)}</p>
      <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1.5">
        <span className="inline-flex items-baseline gap-1.5">
          <span className="text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-muted">
            Fixed
          </span>
          <span className="text-sm font-semibold text-ink">{formatLpa(fixed)}</span>
        </span>
        <span className="inline-flex items-baseline gap-1.5">
          <span className="text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-muted">
            Variable
          </span>
          <span className="text-sm font-semibold text-ink">{formatLpa(variable)}</span>
        </span>
      </div>
    </div>
  );
}

function groupSkills(candidate: Candidate): [string, string[]][] {
  const map = new Map<string, string[]>();
  for (const skill of candidate.skills) {
    const list = map.get(skill.skill_type) ?? [];
    list.push(skill.name);
    map.set(skill.skill_type, list);
  }
  return [...map.entries()];
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon?: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </p>
      <p className="break-words text-[1.0625rem] font-medium leading-relaxed text-ink">{value}</p>
    </div>
  );
}
