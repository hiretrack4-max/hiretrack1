import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Pencil,
  Search,
  Upload,
  UploadCloud,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Avatar, Button, Card, Input, Spinner, StatusPill } from '@/components/ui';
import { useUploadResume } from '@/hooks/useResumes';
import { useCandidates } from '@/hooks/useCandidates';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useToast } from '@/context/ToastContext';
import { apiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/utils';
import type { Resume } from '@/types/api';

const ALLOWED = ['pdf', 'doc', 'docx'];
const ACCEPT = '.pdf,.doc,.docx';

function extOf(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
}

export default function ResumeUpload() {
  const navigate = useNavigate();
  const toast = useToast();
  const upload = useUploadResume();

  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [candidateId, setCandidateId] = useState<number | null>(null);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Resume | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedSearch = useDebouncedValue(candidateSearch);
  const { data: candidatePage, isFetching } = useCandidates({
    search: mode === 'existing' ? debouncedSearch : '',
  });

  const startUpload = (selected: File) => {
    if (!ALLOWED.includes(extOf(selected.name))) {
      toast.error('Unsupported file', 'Please upload a PDF, DOC or DOCX file.');
      return;
    }
    setFile(selected);
    setResult(null);
    setProgress(0);
    upload.mutate(
      {
        file: selected,
        candidate: mode === 'existing' && candidateId !== null ? candidateId : undefined,
        onProgress: setProgress,
      },
      {
        onSuccess: (resume) => {
          setResult(resume);
          if (resume.parse_status === 'PARSED') {
            toast.success('Resume parsed', 'Candidate profile is ready.');
          } else if (resume.parse_status === 'FAILED') {
            toast.error('Parsing failed', 'The file was stored but could not be parsed.');
          } else {
            toast.info('Resume uploaded', 'Parsing is in progress.');
          }
        },
        onError: (err) => {
          toast.error('Upload failed', apiErrorMessage(err));
          setFile(null);
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

  const reset = () => {
    setFile(null);
    setResult(null);
    setProgress(0);
    if (inputRef.current) inputRef.current.value = '';
  };

  const uploading = upload.isPending;

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
        eyebrow="Module 2"
        eyebrowIcon={UploadCloud}
        title="Upload Resume"
        description="Drop a PDF, DOC or DOCX to parse it into a candidate profile."
      />

      {/* Target selector */}
      <Card className="p-5">
        <p className="mb-3 text-sm font-semibold text-ink">Attach resume to</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              setMode('new');
              setCandidateId(null);
            }}
            className={cn(
              'flex items-start gap-3 rounded-2xl border p-4 text-left transition-all',
              mode === 'new'
                ? 'border-brand-400 bg-brand-500/8 shadow-brand-sm'
                : 'border-line bg-surface/50 hover:border-brand-300',
            )}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/12 text-brand-600 dark:text-brand-300">
              <UserPlus className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">New candidate</p>
              <p className="text-2xs text-muted">Parsing creates a fresh profile.</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setMode('existing')}
            className={cn(
              'flex items-start gap-3 rounded-2xl border p-4 text-left transition-all',
              mode === 'existing'
                ? 'border-brand-400 bg-brand-500/8 shadow-brand-sm'
                : 'border-line bg-surface/50 hover:border-brand-300',
            )}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/12 text-brand-600 dark:text-brand-300">
              <FileText className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Existing candidate</p>
              <p className="text-2xs text-muted">Link to a profile you pick below.</p>
            </div>
          </button>
        </div>

        {mode === 'existing' && (
          <div className="mt-4">
            <Input
              placeholder="Search candidates…"
              value={candidateSearch}
              onChange={(e) => {
                setCandidateSearch(e.target.value);
                setCandidateId(null);
              }}
              leftIcon={<Search className="h-4 w-4" />}
            />
            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-line bg-surface/40 p-1.5">
              {isFetching ? (
                <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted">
                  <Spinner className="h-4 w-4" /> Searching…
                </div>
              ) : (candidatePage?.results.length ?? 0) === 0 ? (
                <p className="px-2 py-3 text-sm text-muted">No candidates match.</p>
              ) : (
                candidatePage?.results.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCandidateId(c.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors',
                      candidateId === c.id ? 'bg-brand-500/12' : 'hover:bg-card',
                    )}
                  >
                    <Avatar name={c.full_name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{c.full_name}</p>
                      <p className="truncate text-2xs text-muted">{c.email || '—'}</p>
                    </div>
                    <StatusPill status={c.candidate_status} dot={false} />
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Dropzone / progress / result */}
      {result ? (
        <ResultCard
          result={result}
          onReset={reset}
          onEdit={(cid) => navigate(`/candidates/${cid}?edit=1`)}
          onView={(cid) => navigate(`/candidates/${cid}`)}
        />
      ) : (
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
                <p className="text-sm font-medium text-ink">
                  Uploading {file?.name}…
                </p>
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
                    Drag & drop a resume, or click to browse
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
      )}
    </div>
  );
}

function ResultCard({
  result,
  onReset,
  onEdit,
  onView,
}: {
  result: Resume;
  onReset: () => void;
  onEdit: (candidateId: number) => void;
  onView: (candidateId: number) => void;
}) {
  const parsed = result.parse_status === 'PARSED';
  const failed = result.parse_status === 'FAILED';

  return (
    <Card className="p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <span
          className={cn(
            'flex h-14 w-14 items-center justify-center rounded-2xl',
            parsed && 'bg-status-joined/12 text-status-joined',
            failed && 'bg-status-rejected/12 text-status-rejected',
            !parsed && !failed && 'bg-status-onhold/12 text-status-onhold',
          )}
        >
          {parsed ? (
            <CheckCircle2 className="h-7 w-7" />
          ) : failed ? (
            <XCircle className="h-7 w-7" />
          ) : (
            <FileText className="h-7 w-7" />
          )}
        </span>
        <div className="space-y-1">
          <h3 className="font-display text-lg font-bold text-ink">
            {parsed ? 'Resume parsed successfully' : failed ? 'Parsing failed' : 'Resume uploaded'}
          </h3>
          <p className="text-sm text-muted">{result.original_filename}</p>
        </div>

        <StatusPill status={result.parse_status} />

        {failed && result.parse_error && (
          <p className="w-full rounded-xl border border-status-rejected/30 bg-status-rejected/10 px-3.5 py-2.5 text-left text-sm text-status-rejected">
            {result.parse_error}
          </p>
        )}

        {parsed && result.candidate && (
          <p className="w-full rounded-xl border border-line bg-surface/50 px-3.5 py-2.5 text-left text-sm text-muted">
            Auto-parsing isn't always perfect — open <span className="font-semibold text-ink">Review &amp; edit details</span> to
            check the name, company, education and experience, and fix anything that looks off before you continue.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {result.candidate && (
            <>
              <Button onClick={() => onEdit(result.candidate as number)}>
                <Pencil className="h-4 w-4" />
                Review &amp; edit details
              </Button>
              <Button variant="secondary" onClick={() => onView(result.candidate as number)}>
                View profile
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={onReset}>
            <Upload className="h-4 w-4" />
            Upload another
          </Button>
        </div>
      </div>
    </Card>
  );
}
