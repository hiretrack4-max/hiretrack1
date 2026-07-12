import { useState } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { RotateCcw, Trash2, TriangleAlert } from 'lucide-react';
import { Button, Chip, Modal } from '@/components/ui';
import { useToast } from '@/context/ToastContext';
import { apiErrorMessage } from '@/lib/apiError';
import {
  usePurgeCandidate,
  usePurgeJob,
  useRecycleBin,
  useResetAll,
  useRestoreCandidate,
  useRestoreJob,
} from '@/hooks/useRecycleBin';
import '@/styles/phase2.css';

/** The word the user must type to confirm a full reset. */
const RESET_WORD = 'RESET';

function deletedAgo(iso: string): string {
  try {
    return `deleted ${formatDistanceToNow(parseISO(iso), { addSuffix: true })}`;
  } catch {
    return 'recently deleted';
  }
}

type PurgeTarget = { kind: 'candidate' | 'job'; id: number; name: string };

export default function RecycleBin() {
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useRecycleBin();

  const restoreCandidate = useRestoreCandidate();
  const restoreJob = useRestoreJob();
  const purgeCandidate = usePurgeCandidate();
  const purgeJob = usePurgeJob();
  const resetAll = useResetAll();

  const [purge, setPurge] = useState<PurgeTarget | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState('');

  const candidates = data?.candidates ?? [];
  const jobs = data?.jobs ?? [];
  const total = candidates.length + jobs.length;

  const doRestoreCandidate = (id: number, name: string) =>
    restoreCandidate.mutate(id, {
      onSuccess: () => toast.success('Candidate restored', name),
      onError: (err) => toast.error('Could not restore', apiErrorMessage(err)),
    });

  const doRestoreJob = (id: number, name: string) =>
    restoreJob.mutate(id, {
      onSuccess: () => toast.success('Job restored', name),
      onError: (err) => toast.error('Could not restore', apiErrorMessage(err)),
    });

  const confirmPurge = () => {
    if (!purge) return;
    const opts = {
      onSuccess: () => {
        toast.success('Permanently deleted', purge.name);
        setPurge(null);
      },
      onError: (err: unknown) => toast.error('Could not delete', apiErrorMessage(err)),
    };
    if (purge.kind === 'candidate') purgeCandidate.mutate(purge.id, opts);
    else purgeJob.mutate(purge.id, opts);
  };

  const resetReady = resetText.trim().toUpperCase() === RESET_WORD;
  const confirmReset = () => {
    if (!resetReady) return;
    resetAll.mutate(undefined, {
      onSuccess: (res) => {
        toast.success(
          'Data cleared',
          `${res.candidates_removed} candidate${res.candidates_removed === 1 ? '' : 's'} and ` +
            `${res.jobs_removed} job${res.jobs_removed === 1 ? '' : 's'} moved to the Recycle Bin.`,
        );
        setResetOpen(false);
        setResetText('');
      },
      onError: (err) => toast.error('Reset failed', apiErrorMessage(err)),
    });
  };

  const purging = purgeCandidate.isPending || purgeJob.isPending;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Data</div>
          <h1>Recycle Bin</h1>
          <p className="page-sub">
            Deleted candidates and jobs land here first. Restore them with all their related data,
            or remove them for good.
          </p>
        </div>
        <Button variant="danger" onClick={() => setResetOpen(true)}>
          <TriangleAlert className="h-4 w-4" />
          Clear all data
        </Button>
      </div>

      {isError ? (
        <div className="ib-card">
          <div className="ib-card-body" style={{ color: 'var(--red)' }}>
            Couldn't load the Recycle Bin.{' '}
            <button onClick={() => refetch()} className="font-semibold underline">
              Retry
            </button>
          </div>
        </div>
      ) : isLoading ? (
        <div className="ib-card">
          <div className="ib-card-body field-hint">Loading…</div>
        </div>
      ) : total === 0 ? (
        <div className="ib-card">
          <div className="empty" style={{ border: 0, margin: 0 }}>
            <div className="e-big">The Recycle Bin is empty</div>
            <div style={{ fontSize: 13 }}>
              Deleted candidates and jobs will appear here, ready to restore.
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 24 }}>
          <Section
            title="Deleted candidates"
            count={candidates.length}
            emptyText="No deleted candidates."
          >
            {candidates.map((c) => (
              <BinRow
                key={c.id}
                primary={c.full_name || 'Unnamed candidate'}
                status={c.candidate_status}
                when={deletedAgo(c.deleted_at)}
                onRestore={() => doRestoreCandidate(c.id, c.full_name)}
                onPurge={() =>
                  setPurge({ kind: 'candidate', id: c.id, name: c.full_name || 'this candidate' })
                }
                restoring={restoreCandidate.isPending}
              />
            ))}
          </Section>

          <Section title="Deleted jobs" count={jobs.length} emptyText="No deleted jobs.">
            {jobs.map((j) => (
              <BinRow
                key={j.id}
                primary={j.job_role || 'Untitled role'}
                secondary={j.job_id}
                status={j.job_status}
                when={deletedAgo(j.deleted_at)}
                onRestore={() => doRestoreJob(j.id, j.job_role)}
                onPurge={() => setPurge({ kind: 'job', id: j.id, name: j.job_role || 'this job' })}
                restoring={restoreJob.isPending}
              />
            ))}
          </Section>
        </div>
      )}

      {/* Per-row permanent-delete confirmation */}
      <Modal
        open={purge !== null}
        onClose={() => setPurge(null)}
        size="sm"
        title="Delete permanently?"
        description={
          purge
            ? `“${purge.name}” and all of its related data will be erased. This cannot be undone.`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setPurge(null)} disabled={purging}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmPurge} loading={purging}>
              Delete forever
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Restoring is no longer possible after this. To keep it recoverable, close this dialog and
          use Restore instead.
        </p>
      </Modal>

      {/* Type-to-confirm "Clear all data" reset dialog */}
      <Modal
        open={resetOpen}
        onClose={() => {
          if (!resetAll.isPending) {
            setResetOpen(false);
            setResetText('');
          }
        }}
        size="sm"
        title="Clear all data?"
        description="Every candidate and job moves to the Recycle Bin for a fresh start."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setResetOpen(false);
                setResetText('');
              }}
              disabled={resetAll.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={confirmReset}
              disabled={!resetReady}
              loading={resetAll.isPending}
            >
              Move everything to bin
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Nothing is permanently erased — all records stay restorable from this page. Your login,
            saved report configurations and the audit log are kept intact.
          </p>
          <div>
            <label className="ib-label" htmlFor="reset-confirm">
              Type <b style={{ color: 'var(--orange)' }}>{RESET_WORD}</b> to confirm
            </label>
            <input
              id="reset-confirm"
              className="inp"
              style={{ marginTop: 6 }}
              autoComplete="off"
              placeholder={RESET_WORD}
              value={resetText}
              onChange={(e) => setResetText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && resetReady) confirmReset();
              }}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Section({
  title,
  count,
  emptyText,
  children,
}: {
  title: string;
  count: number;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ib-card">
      <div className="ib-card-head">
        <span className="ib-card-title">{title}</span>
        <span className="ib-card-title" style={{ color: 'var(--orange)' }}>
          {count}
        </span>
      </div>
      {count === 0 ? (
        <div className="ib-card-body field-hint">{emptyText}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>
      )}
    </div>
  );
}

function BinRow({
  primary,
  secondary,
  status,
  when,
  onRestore,
  onPurge,
  restoring,
}: {
  primary: string;
  secondary?: string;
  status: string;
  when: string;
  onRestore: () => void;
  onPurge: () => void;
  restoring: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 20px',
        borderTop: '1px solid var(--line)',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>{primary}</span>
          {secondary && <span className="mono field-hint">{secondary}</span>}
          <Chip status={status} />
        </div>
        <div className="field-hint" style={{ marginTop: 2 }}>
          {when}
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onRestore} loading={restoring}>
        <RotateCcw className="h-4 w-4" />
        Restore
      </Button>
      <Button variant="ghost" size="sm" onClick={onPurge} aria-label="Delete permanently">
        <Trash2 className="h-4 w-4" style={{ color: 'var(--red)' }} />
      </Button>
    </div>
  );
}
