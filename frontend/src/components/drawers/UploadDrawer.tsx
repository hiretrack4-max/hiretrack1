import { useRef, useState } from 'react';
import { Button, Chip, Drawer, Section, Tag, VerifyBadge } from '@/components/ui';
import { useCandidate, useTagCandidate } from '@/hooks/useCandidates';
import { useAllJobs } from '@/hooks/useJobs';
import { useUploadResume } from '@/hooks/useResumes';
import { useToast } from '@/context/ToastContext';
import { apiErrorMessage } from '@/lib/apiError';
import { hasFlag } from '@/lib/candidate';
import type { CandidateExperience } from '@/types/api';

const ALLOWED = ['pdf', 'doc', 'docx'];

function extOf(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
}

export interface UploadDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Called with the created/linked candidate id to open its profile drawer. */
  onCreated: (candidateId: number) => void;
}

export function UploadDrawer({ open, onClose, onCreated }: UploadDrawerProps) {
  const toast = useToast();
  const upload = useUploadResume();
  const { data: allJobs } = useAllJobs();

  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState(0);
  const [candidateId, setCandidateId] = useState<number | null>(null);
  const [uploadedAt, setUploadedAt] = useState<string>('');
  const [failed, setFailed] = useState(false);
  const [job, setJob] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: candidate } = useCandidate(candidateId ?? undefined);
  const tag = useTagCandidate(candidateId ?? 0);

  const activeJobs = (allJobs ?? []).filter((j) => j.is_open_for_mapping);

  const reset = () => {
    setFileName('');
    setProgress(0);
    setCandidateId(null);
    setUploadedAt('');
    setFailed(false);
    setJob('');
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleFile = (file: File) => {
    if (!ALLOWED.includes(extOf(file.name))) {
      toast.error('Unsupported file', 'Only PDF, DOC or DOCX are accepted.');
      return;
    }
    setFailed(false);
    setCandidateId(null);
    setFileName(file.name);
    setProgress(0);
    upload.mutate(
      { file, onProgress: setProgress },
      {
        onSuccess: (r) => {
          setUploadedAt(r.uploaded_at);
          if (r.candidate) {
            setCandidateId(r.candidate);
          } else {
            setFailed(true);
            toast.info('Resume stored', 'Text could not be extracted — fill the profile manually.');
          }
        },
        onError: (err) => {
          toast.error('Upload failed', apiErrorMessage(err));
          setFileName('');
        },
      },
    );
  };

  const go = () => {
    if (candidateId === null) {
      toast.error('Upload a resume first.');
      return;
    }
    const finish = () => {
      const id = candidateId;
      close();
      onCreated(id);
    };
    if (job) {
      tag.mutate(Number(job), {
        onSuccess: () => {
          toast.success('Candidate tagged to role.');
          finish();
        },
        onError: (err) => toast.error('Could not tag', apiErrorMessage(err)),
      });
    } else {
      finish();
    }
  };

  // Duplicate signal: the parser merges by email, so an existing profile is one
  // created well before this upload.
  const isMerged =
    candidate != null &&
    uploadedAt !== '' &&
    new Date(uploadedAt).getTime() - new Date(candidate.created_at).getTime() > 60_000;

  const uploading = upload.isPending;
  const parsed = candidate != null;

  const footer = (
    <>
      <span className="field-hint">
        Salary, notice period and last working day are never read from a resume.
      </span>
      <Button onClick={go} loading={tag.isPending} disabled={candidateId === null}>
        Parse &amp; open profile
      </Button>
    </>
  );

  return (
    <Drawer
      open={open}
      onClose={close}
      eyebrow="RESUME"
      title="Upload resume"
      footer={footer}
      ariaLabel="Upload resume"
    >
      <Section first>Choose the file</Section>
      <div
        className={`drop${dragging ? ' over' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !uploading) inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
      >
        <div className="big">Drop a resume here, or click to browse</div>
        <div className="sm">PDF · DOC · DOCX</div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />

      {uploading && (
        <div className="parsing">
          <span className="spin" /> Parsing <b style={{ margin: '0 4px' }}>{fileName}</b>…{' '}
          {progress < 100 ? `${progress}%` : ''}
        </div>
      )}

      {failed && !uploading && (
        <div className="note-box" style={{ marginTop: 14, color: 'var(--amber)' }}>
          Couldn&apos;t read text from this file — it may be a scanned image. The file was stored;
          continue to fill the profile in manually.
        </div>
      )}

      {parsed && candidate && (
        <div style={{ marginTop: 14 }}>
          <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 12 }}>
            <Chip label="Parsed" variant="good" />
            <span className="ib-mono" style={{ color: 'var(--dim)', fontSize: 12 }}>
              {fileName}
            </span>
          </div>
          <div className="fgrid" style={{ gap: '10px 14px' }}>
            <Cell label="Name" value={candidate.full_name} flag={hasFlag(candidate.parse_flags, 'name')} />
            <Cell label="Email" value={candidate.email} flag={hasFlag(candidate.parse_flags, 'email')} />
            <Cell label="Phone" value={candidate.mobile} flag={hasFlag(candidate.parse_flags, 'phone')} />
            <Cell
              label="Current location"
              value={candidate.current_location}
              flag={hasFlag(candidate.parse_flags, 'location')}
            />
            <Cell
              label="Total exp"
              value={candidate.total_experience_years ? `${candidate.total_experience_years} yrs` : ''}
            />
            <Cell
              label="Relevant exp"
              value={
                candidate.relevant_experience_years
                  ? `${candidate.relevant_experience_years} yrs`
                  : ''
              }
            />
            <Cell label="Current company" value={candidate.current_company} />
            <Cell label="Current designation" value={candidate.current_designation} />
          </div>

          {candidate.experiences.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <label className="field-label" style={{ marginBottom: 6, display: 'flex' }}>
                Experience · computed from date ranges
              </label>
              {candidate.experiences.map((e) => (
                <div className="stint" key={e.id}>
                  <span className="t">
                    {e.designation || 'Role'}
                    {e.company && <span className="co"> · {e.company}</span>}
                  </span>
                  <span className="m">{stintYears(e)}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 14 }} className="flex flex-wrap gap-1">
            {candidate.skills.length > 0 ? (
              candidate.skills
                .slice(0, 16)
                .map((s) => (
                  <Tag key={s.id} hot>
                    {s.name}
                  </Tag>
                ))
            ) : (
              <span className="verify">no skills matched</span>
            )}
          </div>

          {isMerged && (
            <div className="dup-note">
              <b>Existing candidate found</b> — this resume was merged into{' '}
              {candidate.full_name}&apos;s profile instead of creating a duplicate.
            </div>
          )}
        </div>
      )}

      <Section>Tag to a job role</Section>
      <div className="field">
        <label className="field-label">Job role / designation</label>
        <select className="slct" value={job} onChange={(e) => setJob(e.target.value)}>
          <option value="">Select a role… (optional)</option>
          {activeJobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.job_role} · {j.job_id}
            </option>
          ))}
        </select>
        <p className="field-hint">
          Tag once here — the profile won&apos;t ask again. Closed roles can&apos;t take new
          candidates.
        </p>
      </div>
    </Drawer>
  );
}

function Cell({ label, value, flag }: { label: string; value: string; flag?: boolean }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <div style={{ marginTop: 3 }}>
        {value ? value : flag ? <VerifyBadge kind="verify">not found</VerifyBadge> : <span style={{ color: 'var(--dim)' }}>—</span>}
      </div>
    </div>
  );
}

function stintYears(e: CandidateExperience): string {
  if (!e.start_date) return '—';
  const start = new Date(e.start_date);
  const end = e.is_current || !e.end_date ? new Date() : new Date(e.end_date);
  const months = Math.max(
    0,
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()),
  );
  return `${Math.round((months / 12) * 10) / 10} y`;
}

export default UploadDrawer;
