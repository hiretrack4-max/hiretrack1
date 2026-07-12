import { useState } from 'react';
import { GitBranch } from 'lucide-react';
import { Button, Modal, Select, StatusPill, Textarea } from '@/components/ui';
import { CANDIDATE_STATUS_OPTIONS } from '@/constants/choices';
import { useSetCandidateStatus } from '@/hooks/useCandidates';
import { useToast } from '@/context/ToastContext';
import { apiErrorMessage } from '@/lib/apiError';

export interface StatusChangerProps {
  candidateId: number;
  currentStatus: string;
}

/** Compact candidate-status changer with an optional notes capture (Module 6). */
export function StatusChanger({ candidateId, currentStatus }: StatusChangerProps) {
  const toast = useToast();
  const setStatus = useSetCandidateStatus(candidateId);
  const [pending, setPending] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const open = pending !== null;

  const confirm = () => {
    if (pending === null) return;
    setStatus.mutate(
      { candidate_status: pending, notes: notes.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Status updated');
          setPending(null);
          setNotes('');
        },
        onError: (err) => toast.error('Could not update status', apiErrorMessage(err)),
      },
    );
  };

  return (
    <>
      <div className="w-full sm:w-60">
        <Select
          label="Change status"
          options={CANDIDATE_STATUS_OPTIONS}
          value={currentStatus}
          onChange={(e) => {
            if (e.target.value !== currentStatus) {
              setPending(e.target.value);
              setNotes('');
            }
          }}
        />
      </div>

      <Modal
        open={open}
        onClose={() => setPending(null)}
        size="sm"
        title="Update candidate status"
        description="Add an optional note describing this transition."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)} disabled={setStatus.isPending}>
              Cancel
            </Button>
            <Button onClick={confirm} loading={setStatus.isPending}>
              Update status
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface/50 px-3 py-2.5 text-sm">
            <StatusPill status={currentStatus} />
            <GitBranch className="h-4 w-4 rotate-90 text-muted" />
            {pending && <StatusPill status={pending} />}
          </div>
          <Textarea
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Cleared technical round, moving to HR discussion."
          />
        </div>
      </Modal>
    </>
  );
}
