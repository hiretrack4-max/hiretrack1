import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, Plus } from 'lucide-react';
import { Button, Card, EmptyState, StatusPill } from '@/components/ui';
import { MappingModal } from '@/components/mappings/MappingModal';
import { formatDate } from '@/lib/format';
import type { Candidate } from '@/types/api';

export function CandidateMappings({ candidate }: { candidate: Candidate }) {
  const [open, setOpen] = useState(false);
  const mappings = candidate.job_mappings;

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-ink">Job mappings</h3>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          Tag to job
        </Button>
      </div>

      {mappings.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="h-7 w-7" />}
          title="Not tagged to any job yet"
          description="Map this candidate to an open job to start tracking their pipeline."
        />
      ) : (
        <div className="space-y-2.5">
          {mappings.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface/50 p-3.5"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/12 text-brand-600 dark:text-brand-300">
                  <Briefcase className="h-4 w-4" />
                </span>
                <div>
                  <Link
                    to={`/jobs/${m.job}`}
                    className="text-sm font-medium text-ink transition-colors hover:text-brand-600"
                  >
                    {m.job_role}
                  </Link>
                  <p className="text-2xs text-muted">
                    {m.job_id} · Applied {formatDate(m.applied_date)}
                    {m.recruiter_name ? ` · ${m.recruiter_name}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={m.mapping_status} />
                <StatusPill status={m.job_status} dot={false} />
              </div>
            </div>
          ))}
        </div>
      )}

      <MappingModal
        open={open}
        onClose={() => setOpen(false)}
        mode={{
          kind: 'for-candidate',
          candidateId: candidate.id,
          candidateName: candidate.full_name,
        }}
      />
    </Card>
  );
}
