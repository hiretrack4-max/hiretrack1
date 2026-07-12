import { useState } from 'react';
import { CalendarClock, Check, Plus, User } from 'lucide-react';
import {
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  Skeleton,
  StatusPill,
  Textarea,
} from '@/components/ui';
import { MappingSelector } from './MappingSelector';
import { INTERVIEW_RESULT_OPTIONS } from '@/constants/choices';
import { useCreateInterview, useInterviews, useUpdateInterview } from '@/hooks/useInterviews';
import { useToast } from '@/context/ToastContext';
import { apiErrorMessage } from '@/lib/apiError';
import { formatDate, formatTime } from '@/lib/format';
import type { Candidate, Interview } from '@/types/api';

/**
 * Interviews tab — a plain data-capture surface (not a scheduler). The recruiter
 * records the interview details for a candidate's job mapping inline; saving the
 * scheduled date + time is what the backend uses to fire the reminder
 * notification. Interviews attach to a mapping, so a role must be tagged first.
 */
export function CandidateInterviews({ candidate }: { candidate: Candidate }) {
  const mappings = candidate.job_mappings;
  const [selected, setSelected] = useState<number | null>(mappings[0]?.id ?? null);

  const { data: interviews, isLoading } = useInterviews(selected ?? undefined);

  if (mappings.length === 0) {
    return (
      <Card className="p-5">
        <EmptyState
          icon={<CalendarClock className="h-7 w-7" />}
          title="Tag a role first"
          description="Interviews attach to a job mapping. Map this candidate to a role, then capture the interview details here."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {mappings.length > 1 && (
        <Card className="p-5">
          <p className="field-label mb-2">Job mapping</p>
          <MappingSelector mappings={mappings} value={selected} onChange={(id) => setSelected(id)} />
        </Card>
      )}

      {selected !== null && (
        <InterviewCapture
          key={selected}
          mappingId={selected}
          interviews={interviews ?? []}
          loading={isLoading}
        />
      )}
    </div>
  );
}

const BLANK = {
  round: '',
  interviewer: '',
  date: '',
  time: '',
  result: 'PENDING',
  feedback: '',
};

function InterviewCapture({
  mappingId,
  interviews,
  loading,
}: {
  mappingId: number;
  interviews: Interview[];
  loading: boolean;
}) {
  const toast = useToast();
  const create = useCreateInterview();
  const update = useUpdateInterview();
  const saving = create.isPending || update.isPending;

  // null = capturing a new round; a number = editing that interview record.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(BLANK);

  const set = <K extends keyof typeof BLANK>(key: K, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const loadInto = (iv: Interview) => {
    setEditingId(iv.id);
    setForm({
      round: iv.interview_round ?? '',
      interviewer: iv.interviewer_name ?? '',
      date: iv.interview_date ?? '',
      time: iv.interview_time ?? '',
      result: iv.result ?? 'PENDING',
      feedback: iv.feedback ?? '',
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(BLANK);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      interview_round: form.round.trim(),
      interviewer_name: form.interviewer.trim(),
      interview_date: form.date || null,
      interview_time: form.time || null,
      result: form.result,
      feedback: form.feedback.trim(),
    };

    if (editingId !== null) {
      update.mutate(
        { id: editingId, ...payload },
        {
          onSuccess: () => {
            toast.success('Interview updated');
            resetForm();
          },
          onError: (err) => toast.error('Could not save', apiErrorMessage(err)),
        },
      );
    } else {
      create.mutate(
        { mapping: mappingId, ...payload },
        {
          onSuccess: () => {
            toast.success('Interview saved');
            resetForm();
          },
          onError: (err) => toast.error('Could not save', apiErrorMessage(err)),
        },
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Capture form */}
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-ink">
              {editingId !== null ? 'Edit interview' : 'Capture interview'}
            </h3>
            <p className="mt-0.5 text-sm text-muted">
              Set the scheduled date &amp; time to trigger the reminder notification.
            </p>
          </div>
          {editingId !== null && (
            <Button variant="ghost" size="sm" onClick={resetForm} disabled={saving}>
              <Plus className="h-4 w-4" />
              New round
            </Button>
          )}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Scheduled date"
              type="date"
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
            />
            <Input
              label="Scheduled time"
              type="time"
              value={form.time}
              onChange={(e) => set('time', e.target.value)}
            />
            <Input
              label="Round"
              value={form.round}
              onChange={(e) => set('round', e.target.value)}
              placeholder="e.g. Technical Round 1"
            />
            <Input
              label="Interviewer"
              value={form.interviewer}
              onChange={(e) => set('interviewer', e.target.value)}
              placeholder="Interviewer name"
            />
            <Select
              label="Result"
              options={INTERVIEW_RESULT_OPTIONS}
              value={form.result}
              onChange={(e) => set('result', e.target.value)}
            />
          </div>
          <Textarea
            label="Feedback"
            value={form.feedback}
            onChange={(e) => set('feedback', e.target.value)}
            placeholder="Interviewer notes, strengths, concerns…"
          />
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            {editingId !== null && (
              <Button variant="ghost" type="button" onClick={resetForm} disabled={saving}>
                Cancel
              </Button>
            )}
            <Button type="submit" loading={saving}>
              {!saving && <Check className="h-4 w-4" />}
              {editingId !== null ? 'Save changes' : 'Save interview'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Captured rounds */}
      <Card className="p-5">
        <h3 className="mb-4 text-base font-semibold text-ink">Recorded rounds</h3>
        {loading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : interviews.length === 0 ? (
          <EmptyState
            icon={<CalendarClock className="h-7 w-7" />}
            title="No interviews recorded yet"
            description="Capture the first round using the form above."
          />
        ) : (
          <div className="space-y-2.5">
            {interviews.map((iv) => (
              <button
                key={iv.id}
                type="button"
                onClick={() => loadInto(iv)}
                className={
                  'flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5 text-left transition-colors hover:border-line2 hover:bg-panel2 ' +
                  (editingId === iv.id ? 'border-orange bg-wash' : 'border-line bg-surface/50')
                }
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink">
                      {iv.interview_round || 'Interview'}
                    </p>
                    <StatusPill status={iv.result} dot={false} />
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-2xs text-muted">
                    {(iv.interview_date || iv.interview_time) && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" />
                        {formatDate(iv.interview_date)}
                        {iv.interview_time ? ` · ${formatTime(iv.interview_time)}` : ''}
                      </span>
                    )}
                    {iv.interviewer_name && (
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {iv.interviewer_name}
                      </span>
                    )}
                  </p>
                  {iv.feedback && <p className="mt-1 text-sm text-muted">{iv.feedback}</p>}
                </div>
                <span className="text-2xs font-semibold text-muted">Edit</span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
