import { useEffect, useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { Avatar, Button, Input, Modal, Select, Spinner, StatusPill } from '@/components/ui';
import { MAPPING_STATUS_OPTIONS } from '@/constants/choices';
import { useCreateMapping } from '@/hooks/useMappings';
import { useOpenJobs } from '@/hooks/useJobs';
import { useCandidates } from '@/hooks/useCandidates';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/utils';
import type { Job } from '@/types/api';

type Mode =
  | { kind: 'for-candidate'; candidateId: number; candidateName: string }
  | { kind: 'for-job'; job: Job };

export interface MappingModalProps {
  open: boolean;
  onClose: () => void;
  mode: Mode;
  onCreated?: () => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MappingModal({ open, onClose, mode, onCreated }: MappingModalProps) {
  const toast = useToast();
  const { username } = useAuth();
  const createMapping = useCreateMapping();

  const [jobId, setJobId] = useState('');
  const [candidateId, setCandidateId] = useState<number | null>(null);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [recruiter, setRecruiter] = useState('');
  const [appliedDate, setAppliedDate] = useState(today());
  const [mappingStatus, setMappingStatus] = useState('APPLIED');

  useEffect(() => {
    if (open) {
      setJobId('');
      setCandidateId(null);
      setCandidateSearch('');
      setRecruiter(username ?? '');
      setAppliedDate(today());
      setMappingStatus('APPLIED');
    }
  }, [open, username]);

  // --- Job picker (for-candidate mode) ---
  const { data: openJobs, isLoading: jobsLoading } = useOpenJobs();
  const jobOptions = useMemo(
    () =>
      (openJobs ?? []).map((j) => ({
        value: String(j.id),
        label: `${j.job_id} · ${j.job_role}`,
      })),
    [openJobs],
  );

  // --- Candidate picker (for-job mode) ---
  const debouncedCandidate = useDebouncedValue(candidateSearch);
  const { data: candidatePage, isFetching: candLoading } = useCandidates({
    search: mode.kind === 'for-job' ? debouncedCandidate : '',
  });

  const resolvedJobId = mode.kind === 'for-job' ? mode.job.id : Number(jobId);
  const resolvedCandidateId = mode.kind === 'for-candidate' ? mode.candidateId : candidateId;

  const canSubmit =
    resolvedJobId && !Number.isNaN(resolvedJobId) && resolvedCandidateId !== null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || resolvedCandidateId === null) return;
    createMapping.mutate(
      {
        candidate: resolvedCandidateId,
        job: resolvedJobId,
        mapping_status: mappingStatus,
        applied_date: appliedDate,
        recruiter_name: recruiter.trim(),
      },
      {
        onSuccess: () => {
          toast.success('Candidate tagged', 'The mapping was created.');
          onCreated?.();
          onClose();
        },
        onError: (err) => toast.error('Could not create mapping', apiErrorMessage(err)),
      },
    );
  };

  const footer = (
    <>
      <Button variant="ghost" type="button" onClick={onClose} disabled={createMapping.isPending}>
        Cancel
      </Button>
      <Button
        type="submit"
        form="mapping-form"
        loading={createMapping.isPending}
        disabled={!canSubmit}
      >
        Tag candidate
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Tag candidate to job"
      description={
        mode.kind === 'for-candidate'
          ? `Map ${mode.candidateName} to an open job.`
          : `Map a candidate to ${mode.job.job_id} · ${mode.job.job_role}.`
      }
      footer={footer}
    >
      <form id="mapping-form" onSubmit={handleSubmit} className="space-y-4">
        {mode.kind === 'for-candidate' ? (
          jobsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Spinner className="h-4 w-4" /> Loading open jobs…
            </div>
          ) : jobOptions.length === 0 ? (
            <p className="rounded-xl border border-line bg-surface/60 px-3.5 py-3 text-sm text-muted">
              No open jobs are available for mapping. Reopen or create a job first.
            </p>
          ) : (
            <Select
              label="Job"
              options={jobOptions}
              placeholder="Select an open job…"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
            />
          )
        ) : (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Candidate</label>
            <Input
              placeholder="Search candidates by name, email, skill…"
              value={candidateSearch}
              onChange={(e) => {
                setCandidateSearch(e.target.value);
                setCandidateId(null);
              }}
              leftIcon={<Search className="h-4 w-4" />}
            />
            <div className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-xl border border-line bg-surface/40 p-1.5">
              {candLoading ? (
                <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted">
                  <Spinner className="h-4 w-4" /> Searching…
                </div>
              ) : (candidatePage?.results.length ?? 0) === 0 ? (
                <p className="px-2 py-3 text-sm text-muted">No candidates match.</p>
              ) : (
                candidatePage?.results.map((c) => {
                  const active = candidateId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCandidateId(c.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors',
                        active ? 'bg-brand-500/12' : 'hover:bg-card',
                      )}
                    >
                      <Avatar name={c.full_name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{c.full_name}</p>
                        <p className="truncate text-2xs text-muted">
                          {c.current_designation || c.email || '—'}
                        </p>
                      </div>
                      <StatusPill status={c.candidate_status} dot={false} />
                      {active && <Check className="h-4 w-4 shrink-0 text-brand-500" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Recruiter"
            value={recruiter}
            onChange={(e) => setRecruiter(e.target.value)}
            placeholder="Recruiter name"
          />
          <Input
            label="Applied date"
            type="date"
            value={appliedDate}
            onChange={(e) => setAppliedDate(e.target.value)}
          />
        </div>
        <Select
          label="Mapping status"
          options={MAPPING_STATUS_OPTIONS}
          value={mappingStatus}
          onChange={(e) => setMappingStatus(e.target.value)}
        />
      </form>
    </Modal>
  );
}
