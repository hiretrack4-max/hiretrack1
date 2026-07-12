import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Chip, Drawer, Section, Select, Tag, VerifyBadge } from '@/components/ui';
import { CANDIDATE_STATUS_OPTIONS } from '@/constants/choices';
import {
  useCandidate,
  useDeleteCandidate,
  useRecruitmentStatus,
  useTagCandidate,
  useUntagCandidate,
  useUpdateCandidate,
  type CandidateUpdate,
} from '@/hooks/useCandidates';
import { useAllJobs } from '@/hooks/useJobs';
import {
  useCreateInterview,
  useInterviews,
  useUpdateInterview,
} from '@/hooks/useInterviews';
import { useCandidateResume } from '@/hooks/useResumes';
import { useToast } from '@/context/ToastContext';
import { apiErrorMessage } from '@/lib/apiError';
import { deriveLocation, hasFlag, pipeStage } from '@/lib/candidate';
import { formatDate, formatDateTime } from '@/lib/format';
import { ctcTotal, formatLpa, hikePercent, parseLpaInput } from '@/lib/salary';
import { resolveStatus } from '@/constants/statuses';
import type { Candidate, CandidateExperience, CandidateSkill } from '@/types/api';

interface FormState {
  full_name: string;
  email: string;
  mobile: string;
  address: string;
  current_location: string;
  total_experience_years: string;
  relevant_experience_years: string;
  current_company: string;
  current_designation: string;
  highest_qualification: string;
  current_fixed: string;
  current_variable: string;
  expected: string;
  notice_period_days: string;
  last_working_day: string;
  candidate_status: string;
}

interface InterviewState {
  interview_date: string;
  interview_time: string;
  interview_round: string;
  interviewer_name: string;
  feedback: string;
}

function seed(c: Candidate): FormState {
  return {
    full_name: c.full_name ?? '',
    email: c.email ?? '',
    mobile: c.mobile ?? '',
    address: c.address ?? '',
    current_location: c.current_location ?? '',
    total_experience_years: c.total_experience_years ?? '',
    relevant_experience_years: c.relevant_experience_years ?? '',
    current_company: c.current_company ?? '',
    current_designation: c.current_designation ?? '',
    highest_qualification: c.highest_qualification ?? '',
    current_fixed: c.current_ctc_fixed ?? '',
    current_variable: c.current_ctc_variable ?? '',
    expected: c.expected_ctc_fixed ?? '',
    notice_period_days: c.notice_period_days != null ? String(c.notice_period_days) : '',
    last_working_day: c.last_working_day ?? '',
    candidate_status: c.candidate_status,
  };
}

export interface CandidateDrawerProps {
  open: boolean;
  candidateId: number | null;
  onClose: () => void;
  /** Called after a delete so the list can refresh / selection can clear. */
  onDeleted?: () => void;
}

export function CandidateDrawer({ open, candidateId, onClose, onDeleted }: CandidateDrawerProps) {
  const toast = useToast();
  const { data: candidate, isLoading } = useCandidate(candidateId ?? undefined);
  const update = useUpdateCandidate(candidateId ?? 0);
  const remove = useDeleteCandidate();
  const tag = useTagCandidate(candidateId ?? 0);
  const untag = useUntagCandidate(candidateId ?? 0);
  const { data: allJobs } = useAllJobs();
  const { data: history } = useRecruitmentStatus(candidateId ?? undefined);
  const { data: resume } = useCandidateResume(candidateId ?? undefined);

  const mappingId = candidate?.job_mappings?.[0]?.id;
  const { data: interviews } = useInterviews(mappingId);
  const createInterview = useCreateInterview();
  const updateInterview = useUpdateInterview();

  const [form, setForm] = useState<FormState | null>(null);
  const [iv, setIv] = useState<InterviewState>({
    interview_date: '',
    interview_time: '',
    interview_round: '',
    interviewer_name: '',
    feedback: '',
  });
  const seededFor = useRef<number | null>(null);

  // Seed the form once per candidate load.
  useEffect(() => {
    if (candidate && seededFor.current !== candidate.id) {
      seededFor.current = candidate.id;
      setForm(seed(candidate));
    }
  }, [candidate]);

  // Seed interview fields from the first mapping's interview.
  const existingInterview = interviews?.[0];
  const ivSeeded = useRef<number | null>(null);
  useEffect(() => {
    const key = existingInterview?.id ?? (mappingId ? -mappingId : null);
    if (key !== null && ivSeeded.current !== key) {
      ivSeeded.current = key;
      setIv({
        interview_date: existingInterview?.interview_date ?? '',
        interview_time: existingInterview?.interview_time ?? '',
        interview_round: existingInterview?.interview_round ?? '',
        interviewer_name: existingInterview?.interviewer_name ?? '',
        feedback: existingInterview?.feedback ?? '',
      });
    }
  }, [existingInterview, mappingId]);

  const set = <K extends keyof FormState>(key: K, value: string) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const normalizeSalary = (key: 'current_fixed' | 'current_variable' | 'expected') => {
    setForm((prev) => {
      if (!prev) return prev;
      const n = parseLpaInput(prev[key]);
      return { ...prev, [key]: n === null ? '' : String(n) };
    });
  };

  const currentTotal = form ? ctcTotal(form.current_fixed, form.current_variable) : null;
  const expectedTotal = form ? parseLpaInput(form.expected) : null;
  const hike = hikePercent(currentTotal, expectedTotal);

  const flag = (key: string): ReactNode =>
    hasFlag(candidate?.parse_flags, key) ? <VerifyBadge kind="verify" /> : null;

  const taggedJobIds = new Set((candidate?.job_mappings ?? []).map((m) => m.job));
  const addableJobs = (allJobs ?? []).filter(
    (j) => j.is_open_for_mapping && !taggedJobIds.has(j.id),
  );

  const recruiter = candidate?.job_mappings?.find((m) => m.recruiter_name)?.recruiter_name;

  const save = async () => {
    if (!candidate || !form) return;
    if (!form.full_name.trim()) {
      toast.error('Name required', 'Enter the candidate name to save.');
      return;
    }
    const payload: CandidateUpdate = {
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      mobile: form.mobile.trim(),
      address: form.address.trim(),
      current_location: form.current_location.trim() || deriveLocation(form.address),
      total_experience_years: form.total_experience_years.trim() || null,
      relevant_experience_years: form.relevant_experience_years.trim() || null,
      current_company: form.current_company.trim(),
      current_designation: form.current_designation.trim(),
      highest_qualification: form.highest_qualification.trim(),
      notice_period_days: form.notice_period_days ? Number(form.notice_period_days) : 0,
      last_working_day: form.last_working_day || null,
      candidate_status: form.candidate_status,
      current_ctc_fixed: parseLpaInput(form.current_fixed),
      current_ctc_variable: parseLpaInput(form.current_variable),
      expected_ctc_fixed: parseLpaInput(form.expected),
      expected_ctc_variable: null,
    };

    try {
      await update.mutateAsync(payload);
      // Persist interview details against the first mapping, if present.
      if (mappingId && (iv.interview_date || iv.interview_round || iv.interviewer_name)) {
        const ivPayload = {
          interview_date: iv.interview_date || null,
          interview_time: iv.interview_time || null,
          interview_round: iv.interview_round,
          interviewer_name: iv.interviewer_name,
          feedback: iv.feedback,
          result: existingInterview?.result ?? 'PENDING',
        };
        if (existingInterview) {
          await updateInterview.mutateAsync({ id: existingInterview.id, ...ivPayload });
        } else {
          await createInterview.mutateAsync({ mapping: mappingId, ...ivPayload });
        }
      }
      toast.success('Profile saved.');
      onClose();
    } catch (err) {
      toast.error('Could not save profile', apiErrorMessage(err));
    }
  };

  const del = () => {
    if (!candidate) return;
    if (!window.confirm('Delete this candidate permanently?')) return;
    remove.mutate(candidate.id, {
      onSuccess: () => {
        toast.success('Candidate deleted.');
        onDeleted?.();
        onClose();
      },
      onError: (err) => toast.error('Delete failed', apiErrorMessage(err)),
    });
  };

  const stage = pipeStage(form?.candidate_status ?? candidate?.candidate_status ?? '');
  const saving = update.isPending || createInterview.isPending || updateInterview.isPending;

  const footer = (
    <>
      <Button variant="danger" onClick={del} loading={remove.isPending}>
        Delete candidate
      </Button>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} loading={saving} disabled={!form}>
          Save profile
        </Button>
      </div>
    </>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow={candidate ? `#${candidate.id} · received ${formatDate(candidate.created_at)}` : 'CANDIDATE'}
      title={candidate?.full_name || 'Candidate'}
      footer={footer}
      ariaLabel="Candidate profile"
    >
      {isLoading || !candidate || !form ? (
        <div className="parsing">
          <span className="spin" /> Loading profile…
        </div>
      ) : (
        <div>
          {/* Status strip + tags + pipeline */}
          <div style={{ marginBottom: 18 }}>
            <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 12 }}>
              <Chip status={form.candidate_status} />
              {candidate.job_mappings.map((m) => (
                <Tag
                  key={m.id}
                  hot
                  onRemove={() =>
                    untag.mutate(m.job, {
                      onSuccess: () => toast.info('Role removed.'),
                      onError: (err) => toast.error('Could not untag', apiErrorMessage(err)),
                    })
                  }
                >
                  {m.job_role}
                </Tag>
              ))}
              {addableJobs.length > 0 && (
                <select
                  className="slct"
                  style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
                  value=""
                  onChange={(e) => {
                    const jid = Number(e.target.value);
                    if (!jid) return;
                    tag.mutate(jid, {
                      onSuccess: () => toast.success('Role added.'),
                      onError: (err) => toast.error('Could not tag', apiErrorMessage(err)),
                    });
                  }}
                >
                  <option value="">＋ Add role…</option>
                  {addableJobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.job_role}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="pill-bar">
              <i style={{ width: `${stage.pct}%`, background: stage.color }} />
            </div>
          </div>

          {/* 01 — Candidate information */}
          <Section first>Candidate information</Section>
          <div className="fgrid">
            <Field label="Candidate name" flag={flag('name')}>
              <input className="inp" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
            </Field>
            <Field label="Email" flag={flag('email')}>
              <input className="inp" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </Field>
            <Field label="Contact number" flag={flag('phone')}>
              <input className="inp" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} />
            </Field>
          </div>

          {/* 02 — Location / Address */}
          <Section>Location / Address</Section>
          <div className="fgrid">
            <div className="field wide">
              <label className="field-label">
                Address {flag('address')}
                <span className="inline-hint">— from the resume header or footer</span>
              </label>
              <textarea
                className="txta"
                style={{ minHeight: 56 }}
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                onBlur={() => {
                  if (!form.current_location.trim())
                    set('current_location', deriveLocation(form.address));
                }}
              />
            </div>
            <div className="field wide">
              <label className="field-label">
                Current location {flag('location')} <span className="auto">from address</span>
              </label>
              <div className="flex gap-2">
                <input
                  className="inp"
                  value={form.current_location}
                  placeholder="e.g. Bengaluru"
                  onChange={(e) => set('current_location', e.target.value)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}
                  onClick={() => {
                    const d = deriveLocation(form.address);
                    if (d) {
                      set('current_location', d);
                      toast.info(`Location set to ${d}.`);
                    } else toast.error("Couldn't read a city from that address.");
                  }}
                >
                  ↻ From address
                </Button>
              </div>
              <p className="field-hint">Pulled from the address. Different city? Type over it.</p>
            </div>
          </div>

          {/* 03 — Experience & skills */}
          <Section>Experience &amp; skills</Section>
          <div className="fgrid">
            <Field label="Total experience (yrs)" flag={flag('totalExp')} auto="from date ranges">
              <input
                className="inp"
                type="number"
                step="0.1"
                value={form.total_experience_years}
                onChange={(e) => set('total_experience_years', e.target.value)}
              />
            </Field>
            <Field label="Relevant experience (yrs)" flag={flag('relevantExp')} auto="excl. internships">
              <input
                className="inp"
                type="number"
                step="0.1"
                value={form.relevant_experience_years}
                onChange={(e) => set('relevant_experience_years', e.target.value)}
              />
            </Field>
            <Field label="Current company" flag={flag('currentCompany')}>
              <input className="inp" value={form.current_company} onChange={(e) => set('current_company', e.target.value)} />
            </Field>
            <Field label="Current designation" flag={flag('currentDesignation')}>
              <input
                className="inp"
                value={form.current_designation}
                onChange={(e) => set('current_designation', e.target.value)}
              />
            </Field>
            <Field label="Highest qualification" flag={flag('qualification')}>
              <input
                className="inp"
                value={form.highest_qualification}
                onChange={(e) => set('highest_qualification', e.target.value)}
              />
            </Field>
          </div>
          <SkillCloud skills={candidate.skills} flag={flag('skills')} />
          <ExperienceHistory experiences={candidate.experiences} />

          {/* 04 — Current salary */}
          <Section>
            Current salary <span className="manual">manual</span>
          </Section>
          <div className="fgrid">
            <div className="field">
              <label className="field-label">Fixed</label>
              <div className="adorn">
                <input
                  className="inp"
                  type="number"
                  step="0.01"
                  value={form.current_fixed}
                  placeholder="16"
                  onChange={(e) => set('current_fixed', e.target.value)}
                  onBlur={() => normalizeSalary('current_fixed')}
                />
                <span className="suf">LPA</span>
              </div>
            </div>
            <div className="field">
              <label className="field-label">Variable</label>
              <div className="adorn">
                <input
                  className="inp"
                  type="number"
                  step="0.01"
                  value={form.current_variable}
                  placeholder="2.5"
                  onChange={(e) => set('current_variable', e.target.value)}
                  onBlur={() => normalizeSalary('current_variable')}
                />
                <span className="suf">LPA</span>
              </div>
            </div>
            <div className="field">
              <label className="field-label">
                Total <span className="auto">auto</span>
              </label>
              <div className="adorn">
                <input className="inp" readOnly value={currentTotal ?? ''} />
                <span className="suf">LPA</span>
              </div>
            </div>
          </div>
          <p className="field-hint">
            Type <b>16</b> → 16 LPA · <b>16.2</b> → 16.2 LPA · paste <b>1600000</b> and it converts
            to 16 LPA.
          </p>

          {/* 05 — Expected salary & availability */}
          <Section>
            Expected salary &amp; availability <span className="manual">manual</span>
          </Section>
          <div className="fgrid">
            <div className="field">
              <label className="field-label">Expected salary</label>
              <div className="adorn">
                <input
                  className="inp"
                  type="number"
                  step="0.01"
                  value={form.expected}
                  placeholder="22"
                  onChange={(e) => set('expected', e.target.value)}
                  onBlur={() => normalizeSalary('expected')}
                />
                <span className="suf">LPA</span>
              </div>
              {hike !== null && currentTotal !== null && (
                <p className="field-hint">
                  {hike}% hike on {formatLpa(currentTotal)} total
                </p>
              )}
            </div>
            <div className="field">
              <label className="field-label">Notice period (days)</label>
              <input
                className="inp"
                type="number"
                min={0}
                value={form.notice_period_days}
                onChange={(e) => set('notice_period_days', e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field-label">Last working day</label>
              <input
                className="inp"
                type="date"
                value={form.last_working_day}
                onChange={(e) => set('last_working_day', e.target.value)}
              />
            </div>
          </div>

          {/* 06 — Recruitment */}
          <Section>Recruitment</Section>
          <div className="fgrid">
            <Select
              label="Candidate status"
              options={CANDIDATE_STATUS_OPTIONS}
              value={form.candidate_status}
              onChange={(e) => set('candidate_status', e.target.value)}
            />
            <div className="field">
              <label className="field-label">
                HR / recruiter <span className="auto">from tag</span>
              </label>
              <input className="inp" readOnly value={recruiter || '—'} />
            </div>
          </div>

          {/* 07 — Resume file */}
          <Section>Resume file</Section>
          <div className="resume-row">
            <span className="ico">▤</span>
            <span className="fn">{resume?.original_filename || 'No stored resume'}</span>
            {resume?.file ? (
              <>
                <a className="btn ghost sm" href={resume.file} target="_blank" rel="noreferrer">
                  Open
                </a>
                <a className="btn ghost sm" href={resume.file} download>
                  Download
                </a>
              </>
            ) : (
              <span className="verify">not stored</span>
            )}
          </div>

          {/* 08 — Interview details */}
          <Section>
            Interview details <span className="inline-hint">optional</span>
          </Section>
          {mappingId ? (
            <div className="fgrid">
              <div className="field">
                <label className="field-label">Interview date</label>
                <input
                  className="inp"
                  type="date"
                  value={iv.interview_date}
                  onChange={(e) => setIv((p) => ({ ...p, interview_date: e.target.value }))}
                />
              </div>
              <div className="field">
                <label className="field-label">Interview time</label>
                <input
                  className="inp"
                  type="time"
                  value={iv.interview_time}
                  onChange={(e) => setIv((p) => ({ ...p, interview_time: e.target.value }))}
                />
              </div>
              <div className="field">
                <label className="field-label">Round</label>
                <input
                  className="inp"
                  value={iv.interview_round}
                  placeholder="e.g. Technical 1"
                  onChange={(e) => setIv((p) => ({ ...p, interview_round: e.target.value }))}
                />
              </div>
              <div className="field">
                <label className="field-label">Interviewer</label>
                <input
                  className="inp"
                  value={iv.interviewer_name}
                  onChange={(e) => setIv((p) => ({ ...p, interviewer_name: e.target.value }))}
                />
              </div>
              <div className="field wide">
                <label className="field-label">Feedback</label>
                <textarea
                  className="txta"
                  value={iv.feedback}
                  onChange={(e) => setIv((p) => ({ ...p, feedback: e.target.value }))}
                />
              </div>
            </div>
          ) : (
            <div className="note-box">
              Tag this candidate to a job role to record interview details — interviews are tracked
              per job mapping.
            </div>
          )}

          {/* 09 — History */}
          <Section>History</Section>
          {history && history.length > 0 ? (
            <div className="hist">
              {history.map((h) => (
                <div className="hist-i" key={h.id}>
                  <div>
                    {h.previous_status
                      ? `${resolveStatus(h.previous_status).label} → ${resolveStatus(h.new_status).label}`
                      : `Status set to ${resolveStatus(h.new_status).label}`}
                    {h.notes ? ` · ${h.notes}` : ''}
                  </div>
                  <div className="hist-t">{formatDateTime(h.changed_at)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="note-box">No status changes recorded yet.</div>
          )}
        </div>
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------------------

function Field({
  label,
  flag,
  auto,
  children,
}: {
  label: string;
  flag?: ReactNode;
  auto?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="field-label">
        {label} {flag}
        {auto && <span className="auto">{auto}</span>}
      </label>
      {children}
    </div>
  );
}

function SkillCloud({ skills, flag }: { skills: CandidateSkill[]; flag: ReactNode }) {
  const chips = useMemo(() => {
    const items = skills.filter((s) => s.skill_type !== 'CERTIFICATION');
    const certs = skills.filter((s) => s.skill_type === 'CERTIFICATION');
    return { items, certs };
  }, [skills]);
  if (skills.length === 0) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <label className="field-label" style={{ marginBottom: 8, display: 'flex' }}>
        Skills &amp; technologies {flag} <span className="auto">parsed</span>
      </label>
      <div className="flex flex-wrap gap-1">
        {chips.items.map((s) => (
          <Tag key={s.id} hot={s.skill_type === 'TECHNOLOGY'}>
            {s.name}
          </Tag>
        ))}
        {chips.certs.map((s) => (
          <Tag key={s.id}>{s.name} · cert</Tag>
        ))}
      </div>
    </div>
  );
}

function ExperienceHistory({ experiences }: { experiences: CandidateExperience[] }) {
  if (experiences.length === 0) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <label className="field-label" style={{ marginBottom: 8, display: 'flex' }}>
        Employment history detected
      </label>
      {experiences.map((e) => (
        <div className="stint" key={e.id}>
          <span className="t">
            {e.designation || 'Role'}
            {e.company && <span className="co"> · {e.company}</span>}
          </span>
          <span className="r">{e.is_current ? 'ongoing' : ''}</span>
          <span className="m">{durationLabel(e)}</span>
        </div>
      ))}
    </div>
  );
}

function durationLabel(e: CandidateExperience): string {
  if (!e.start_date) return '—';
  const start = new Date(e.start_date);
  const end = e.is_current || !e.end_date ? new Date() : new Date(e.end_date);
  const months = Math.max(
    0,
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()),
  );
  const yrs = Math.round((months / 12) * 10) / 10;
  return `${yrs} y`;
}

export default CandidateDrawer;
