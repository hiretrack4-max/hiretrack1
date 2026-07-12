import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Briefcase, MapPin, Trash2, Users } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Avatar, Button, Card, EmptyState, Skeleton, StatusPill, Tabs, type TabItem } from '@/components/ui';
import { StatusChanger } from '@/components/candidates/StatusChanger';
import { StatusHistory } from '@/components/candidates/StatusHistory';
import { CandidateOverview } from '@/components/candidates/CandidateOverview';
import { CandidateMappings } from '@/components/candidates/CandidateMappings';
import { CandidateInterviews } from '@/components/candidates/CandidateInterviews';
import { useCandidate, useDeleteCandidate } from '@/hooks/useCandidates';
import { useToast } from '@/context/ToastContext';
import { apiErrorMessage } from '@/lib/apiError';
import { formatYears } from '@/lib/format';

const TABS: TabItem[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'mappings', label: 'Job Mappings' },
  { value: 'interviews', label: 'Interviews' },
];

export default function CandidateDetail() {
  const { id } = useParams();
  const candidateId = Number(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { data: candidate, isLoading, isError } = useCandidate(candidateId);
  const deleteCandidate = useDeleteCandidate();
  const [tab, setTab] = useState('overview');
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (isError || !candidate) {
    return (
      <Card className="p-8">
        <EmptyState
          icon={<Users className="h-7 w-7" />}
          title="Candidate not found"
          description="This profile may have been removed."
          action={
            <Button variant="secondary" onClick={() => navigate('/candidates')}>
              Back to candidates
            </Button>
          }
        />
      </Card>
    );
  }

  const subtitleParts = [candidate.current_designation, candidate.current_company].filter(Boolean);

  return (
    <div className="space-y-6">
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
        title={candidate.full_name}
        actions={
          <Button
            variant="ghost"
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete candidate"
          >
            <Trash2 className="h-4 w-4 text-status-rejected" />
            Delete
          </Button>
        }
      />

      {/* Identity + status changer */}
      <Card className="relative overflow-hidden p-5">
        <div className="pointer-events-none absolute inset-0 bg-mesh-light" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={candidate.full_name} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-lg font-bold text-ink">
                  {candidate.full_name}
                </span>
                <StatusPill status={candidate.candidate_status} />
              </div>
              <p className="mt-0.5 text-sm text-muted">
                {subtitleParts.length > 0 ? subtitleParts.join(' · ') : 'Candidate'}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted">
                {candidate.current_location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {candidate.current_location}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Briefcase className="h-3 w-3" />
                  {formatYears(candidate.total_experience_years)} experience
                </span>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {candidate.job_mappings.length} job mapping
                  {candidate.job_mappings.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>
          </div>
          <StatusChanger candidateId={candidate.id} currentStatus={candidate.candidate_status} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className="overflow-x-auto">
            <Tabs tabs={TABS} value={tab} onChange={setTab} />
          </div>

          {tab === 'overview' && <CandidateOverview candidate={candidate} />}
          {tab === 'mappings' && <CandidateMappings candidate={candidate} />}
          {tab === 'interviews' && <CandidateInterviews candidate={candidate} />}
        </div>

        <div className="lg:col-span-1">
          <StatusHistory candidateId={candidate.id} />
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this candidate?"
        description="The candidate — with their resume, skills, job mappings and interviews — moves to the Recycle Bin, where you can restore it later."
        confirmLabel="Delete"
        danger
        loading={deleteCandidate.isPending}
        onConfirm={() =>
          deleteCandidate.mutate(candidate.id, {
            onSuccess: () => {
              toast.success('Moved to Recycle Bin', candidate.full_name);
              navigate('/candidates');
            },
            onError: (err) => toast.error('Could not delete candidate', apiErrorMessage(err)),
          })
        }
      />
    </div>
  );
}
