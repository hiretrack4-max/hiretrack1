import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, JobCard } from '@/components/ui';
import { JobDrawer } from '@/components/drawers/JobDrawer';
import { useAllJobs } from '@/hooks/useJobs';
import { formatDate } from '@/lib/format';
import type { Job } from '@/types/api';
import '@/styles/phase2.css';

/** Pipeline-depth for the JobCard spine: candidates relative to a soft target. */
function depthOf(job: Job): number {
  if (!job.candidate_count) return 0;
  const target = Math.max(1, job.number_of_openings) * 4;
  return Math.min(100, Math.max(8, (job.candidate_count / target) * 100));
}

function metaOf(job: Job): string {
  const exp =
    job.experience_min_years && job.experience_max_years
      ? `${Number(job.experience_min_years)}–${Number(job.experience_max_years)} yrs`
      : job.experience_min_years
        ? `${Number(job.experience_min_years)}+ yrs`
        : '';
  return [job.location, exp, `${job.number_of_openings} opening${job.number_of_openings === 1 ? '' : 's'}`]
    .filter(Boolean)
    .join(' · ');
}

export default function Jobs() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data: jobs, isLoading } = useAllJobs();

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Job | null>(null);

  // Deep-link: /jobs?open=<jobId> opens that job's drawer once loaded.
  useEffect(() => {
    const id = params.get('open');
    if (id && jobs) {
      const job = jobs.find((j) => String(j.id) === id);
      if (job) {
        setSelected(job);
        setOpen(true);
      }
      params.delete('open');
      setParams(params, { replace: true });
    }
  }, [params, jobs, setParams]);

  const openCreate = () => {
    setSelected(null);
    setOpen(true);
  };
  const openJob = (job: Job) => {
    setSelected(job);
    setOpen(true);
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Requisitions</div>
          <h1>Job Roles</h1>
          <p className="page-sub">Paste a job description — the role becomes row one.</p>
        </div>
        <Button onClick={openCreate}>＋ Add JD</Button>
      </div>

      {isLoading ? (
        <div className="jgrid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="ib-card shimmer" style={{ height: 190 }} />
          ))}
        </div>
      ) : !jobs || jobs.length === 0 ? (
        <div className="empty">
          <div className="e-big">No job roles yet</div>
          <div style={{ fontSize: 13, maxWidth: '46ch', margin: '0 auto' }}>
            Click “Add JD”, paste the description, save. The role is picked up for you.
          </div>
        </div>
      ) : (
        <div className="jgrid">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              jobId={job.job_id}
              status={job.job_status}
              role={job.job_role}
              meta={metaOf(job)}
              jd={job.description?.summary ?? ''}
              candidateCount={job.candidate_count}
              date={formatDate(job.created_at)}
              depth={depthOf(job)}
              onClick={() => openJob(job)}
            />
          ))}
        </div>
      )}

      <JobDrawer
        open={open}
        job={selected}
        onClose={() => setOpen(false)}
        onOpenCandidate={(id) => {
          setOpen(false);
          navigate(`/candidates?open=${id}`);
        }}
      />
    </div>
  );
}
