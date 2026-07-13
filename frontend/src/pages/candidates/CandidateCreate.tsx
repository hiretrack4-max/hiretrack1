import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  PencilLine,
  Sparkles,
  Upload,
  UploadCloud,
  UserPlus,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Button, Card } from '@/components/ui';
import { CandidateFormFields } from '@/components/candidates/CandidateFormFields';
import {
  blankCandidateForm,
  buildCandidatePayload,
  parsedToForm,
  type CandidateFormState,
} from '@/components/candidates/candidateForm';
import { useCreateCandidate } from '@/hooks/useCandidates';
import { useParseResumePreview, useUploadResume } from '@/hooks/useResumes';
import { useToast } from '@/context/ToastContext';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import type { Candidate } from '@/types/api';

const ALLOWED = ['pdf', 'doc', 'docx'];
const ACCEPT = '.pdf,.doc,.docx';

function extOf(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
}

export default function CandidateCreate() {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const preview = useParseResumePreview();
  const upload = useUploadResume();
  const createCandidate = useCreateCandidate();

  const [phase, setPhase] = useState<'upload' | 'review'>('upload');
  const [manual, setManual] = useState(false);
  const [form, setForm] = useState<CandidateFormState>(blankCandidateForm);
  // The resume the user dropped, held in memory until they click Save. NOTHING
  // is written to the database until then — dropping a resume no longer creates
  // a candidate.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [parsedFrom, setParsedFrom] = useState('');
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof CandidateFormState>(key: K, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const startUpload = (selected: File) => {
    if (!ALLOWED.includes(extOf(selected.name))) {
      toast.error('Unsupported file', 'Please upload a PDF, DOC or DOCX file.');
      return;
    }
    setManual(false);
    setFileName(selected.name);
    setProgress(0);
    preview.mutate(
      { file: selected, onProgress: setProgress },
      {
        onSuccess: (result) => {
          // Prefill from the parse, but persist nothing yet.
          setForm(parsedToForm(result.fields));
          setPendingFile(selected);
          setParsedFrom(result.filename);
          toast.success('Resume parsed', 'Review the extracted details, then save.');
          setPhase('review');
        },
        onError: (err) => {
          toast.error('Could not read resume', apiErrorMessage(err));
          setFileName('');
        },
      },
    );
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) startUpload(dropped);
  };

  const startManual = () => {
    setForm(blankCandidateForm());
    setPendingFile(null);
    setParsedFrom('');
    setManual(true);
    setPhase('review');
  };

  const save = async () => {
    if (!form.full_name.trim()) {
      toast.error('Name required', 'Enter the candidate’s full name to save.');
      return;
    }
    const payload = buildCandidatePayload(form);

    // Manual path — no resume attached: a single create call.
    if (!pendingFile) {
      createCandidate.mutate(payload, {
        onSuccess: (c) => {
          toast.success('Candidate created', c.full_name);
          navigate(`/candidates/${c.id}`);
        },
        onError: (err) => toast.error('Could not create candidate', apiErrorMessage(err)),
      });
      return;
    }

    // Resume path — create the candidate NOW (Save), which stores the file and
    // parses skills/experience, then apply the HR user's field edits on top.
    setSubmitting(true);
    try {
      const resume = await upload.mutateAsync({ file: pendingFile });
      const created = resume.candidate;
      if (!created) {
        // Parse produced no candidate — fall back to a plain create.
        const c = await createCandidate.mutateAsync(payload);
        toast.success('Candidate created', c.full_name);
        navigate(`/candidates/${c.id}`);
        return;
      }
      const { data: c } = await api.patch<Candidate>(`/candidates/${created}/`, payload);
      qc.setQueryData(['candidates', 'detail', created], c);
      qc.invalidateQueries({ queryKey: ['candidates', 'list'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Candidate saved', c.full_name);
      navigate(`/candidates/${created}`);
    } catch (err) {
      toast.error('Could not save candidate', apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const uploading = preview.isPending;
  const saving = submitting || createCandidate.isPending;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        back={
          <Link
            to="/candidates"
            className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to candidates
          </Link>
        }
        eyebrow="Talent"
        eyebrowIcon={UserPlus}
        title="Add Candidate"
        description="Upload a resume to auto-fill the profile, or enter the basic details yourself — then review and save."
      />

      {!manual && <Steps phase={phase} />}

      {phase === 'upload' ? (
        <div className="space-y-4">
          {/* Two equal ways to add a candidate */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-2xl border border-brand-400 bg-brand-500/8 p-4 text-left shadow-brand-sm">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/12 text-brand-600 dark:text-brand-300">
                <UploadCloud className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">Upload a resume</p>
                <p className="text-2xs text-muted">Auto-fill the profile from a PDF, DOC or DOCX.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={startManual}
              disabled={uploading}
              className="flex items-start gap-3 rounded-2xl border border-line bg-surface/50 p-4 text-left transition-all hover:border-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/12 text-brand-600 dark:text-brand-300">
                <PencilLine className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">Enter details manually</p>
                <p className="text-2xs text-muted">Type the candidate’s basic details yourself — no resume needed.</p>
              </div>
            </button>
          </div>

          {/* Resume dropzone (for the "Upload a resume" option) */}
          <Card className="p-5">
            <div
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
              onDrop={onDrop}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-all',
                dragging
                  ? 'border-brand-500 bg-brand-500/8'
                  : 'border-line bg-surface/40 hover:border-brand-300',
                uploading && 'pointer-events-none opacity-80',
              )}
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-gradient text-white shadow-brand">
                <UploadCloud className="h-8 w-8" />
              </span>
              {uploading ? (
                <div className="w-full max-w-xs space-y-2">
                  <p className="text-sm font-medium text-ink">Uploading {fileName}…</p>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted/15">
                    <div
                      className="h-full rounded-full bg-brand-gradient transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-2xs text-muted">
                    {progress < 100 ? `${progress}%` : 'Parsing resume…'}
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      Drag &amp; drop a resume, or click to browse
                    </p>
                    <p className="mt-1 text-xs text-muted">PDF, DOC or DOCX · single file</p>
                  </div>
                  <Button type="button" variant="secondary" size="sm">
                    <Upload className="h-4 w-4" />
                    Choose file
                  </Button>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  if (selected) startUpload(selected);
                }}
              />
            </div>
          </Card>
        </div>
      ) : (
        <Card className="p-5">
          {parsedFrom ? (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-brand-400/40 bg-brand-500/8 p-3">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              <p className="text-sm text-ink">
                Pre-filled from <span className="font-semibold">{parsedFrom}</span>. Nothing is
                saved yet — review and edit any field below, then click Save.
              </p>
            </div>
          ) : manual ? (
            <div className="mb-4 flex items-center gap-2.5">
              <PencilLine className="h-4 w-4 shrink-0 text-brand-500" />
              <p className="text-sm text-muted">
                Enter the candidate’s basic details, then click Save. You can add a resume later.
              </p>
            </div>
          ) : null}
          <CandidateFormFields form={form} set={set} />
          <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={() => navigate('/candidates')} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              <CheckCircle2 className="h-4 w-4" />
              Save candidate
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Steps({ phase }: { phase: 'upload' | 'review' }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <StepPill active={phase === 'upload'} done={phase === 'review'} index={1} label="Upload resume" />
      <span className="h-px flex-1 bg-line" />
      <StepPill active={phase === 'review'} done={false} index={2} label="Review & save" />
    </div>
  );
}

function StepPill({
  active,
  done,
  index,
  label,
}: {
  active: boolean;
  done: boolean;
  index: number;
  label: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-medium transition-colors',
        active
          ? 'bg-brand-gradient text-white shadow-brand-sm'
          : done
            ? 'bg-status-joined/12 text-status-joined'
            : 'bg-muted/12 text-muted',
      )}
    >
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-full text-2xs font-bold',
          active ? 'bg-white/25' : done ? 'bg-status-joined/20' : 'bg-muted/20',
        )}
      >
        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : index}
      </span>
      {label}
    </span>
  );
}
