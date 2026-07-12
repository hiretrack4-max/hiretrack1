import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Chip, MetricRow, MetricTile } from '@/components/ui';
import { useAllCandidates } from '@/hooks/useCandidates';
import { useAllJobs } from '@/hooks/useJobs';
import { useAllMappings } from '@/hooks/useMappings';
import { useExportReport } from '@/hooks/useReports';
import { fetchAllPages } from '@/lib/paged';
import { useToast } from '@/context/ToastContext';
import { apiErrorMessage } from '@/lib/apiError';
import { formatDate } from '@/lib/format';
import { JOB_STATUS, resolveStatus } from '@/constants/statuses';
import {
  openingsRows,
  presetRange,
  presetToDateFilter,
  type Grain,
  type Preset,
} from '@/lib/reportPeriods';
import type { RecruitmentStatusEntry } from '@/types/api';
import '@/styles/phase2.css';

const PRESETS: [Preset, string][] = [
  ['today', 'Today'],
  ['this-week', 'This week'],
  ['this-month', 'This month'],
  ['this-year', 'This year'],
  ['custom', 'Custom'],
  ['all', 'All time'],
];

const GRAINS: [Grain, string][] = [
  ['week', 'Weekly'],
  ['month', 'Monthly'],
  ['year', 'Yearly'],
];

const TAB_SUB: Record<'candidate' | 'job' | 'openings', string> = {
  candidate: 'Recruitment status by job role and candidate. Export as CSV, Excel or PDF.',
  job: 'Every job with its status and candidate count, plus a jobs-by-status summary.',
  openings: 'Openings posted, closed and still open — by week, month or year.',
};

export default function Reports() {
  const [tab, setTab] = useState<'candidate' | 'job' | 'openings'>('candidate');

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Module 8</div>
          <h1>Reports</h1>
          <p className="page-sub">{TAB_SUB[tab]}</p>
        </div>
      </div>

      <div className="dtabs">
        <button className={tab === 'candidate' ? 'on' : ''} onClick={() => setTab('candidate')}>
          Candidate report
        </button>
        <button className={tab === 'job' ? 'on' : ''} onClick={() => setTab('job')}>
          Job report
        </button>
        <button className={tab === 'openings' ? 'on' : ''} onClick={() => setTab('openings')}>
          Openings report
        </button>
      </div>

      {tab === 'candidate' ? <CandidateReport /> : tab === 'job' ? <JobReport /> : <OpeningsReport />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ExportButtons({ onExport, busy }: { onExport: (fmt: string) => void; busy: boolean }) {
  return (
    <div className="flex gap-2">
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => onExport('csv')}>
        CSV
      </Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => onExport('excel')}>
        Excel
      </Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => onExport('pdf')}>
        PDF
      </Button>
    </div>
  );
}

function CandidateReport() {
  const toast = useToast();
  const exportReport = useExportReport();
  const { data: candidates } = useAllCandidates();
  const { data: jobs } = useAllJobs();
  const { data: mappings } = useAllMappings();

  const [preset, setPreset] = useState<Preset>('this-month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [job, setJob] = useState('');
  const [status, setStatus] = useState('');

  const rolesById = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const m of mappings ?? []) {
      const arr = map.get(m.candidate) ?? [];
      arr.push(m.job_role);
      map.set(m.candidate, arr);
    }
    return map;
  }, [mappings]);

  const range = presetRange(preset, from, to);

  const rows = useMemo(() => {
    const selectedRole = jobs?.find((j) => String(j.id) === job)?.job_role;
    return (candidates ?? []).filter((c) => {
      const ref = new Date(c.created_at);
      if (ref < range.from || ref > range.to) return false;
      if (status && c.candidate_status !== status) return false;
      if (selectedRole) {
        const roles = rolesById.get(c.id) ?? [];
        if (!roles.includes(selectedRole)) return false;
      }
      return true;
    });
  }, [candidates, jobs, job, status, range.from, range.to, rolesById]);

  const runExport = (fmt: string) => {
    if (preset === 'custom' && (!from || !to)) {
      toast.error('Pick a start and end date.');
      return;
    }
    const df =
      preset === 'custom'
        ? { date_filter: 'CUSTOM', start: from, end: to }
        : preset === 'all'
          ? { date_filter: 'CUSTOM', start: '2000-01-01', end: new Date().toISOString().slice(0, 10) }
          : presetToDateFilter(preset);
    exportReport.mutate(
      { report_type: 'candidate', format: fmt, ...df },
      {
        onSuccess: () => toast.success('Report downloaded.'),
        onError: (err) => toast.error('Export failed', apiErrorMessage(err)),
      },
    );
  };

  const label =
    preset === 'all'
      ? 'All time'
      : `${formatDate(range.from.toISOString())} – ${formatDate(range.to.toISOString())}`;

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <span className="ib-label">Filters honour the date range in the file; role &amp; status refine the preview.</span>
        <ExportButtons onExport={runExport} busy={exportReport.isPending} />
      </div>

      <div className="filters">
        <div className="seg">
          {PRESETS.map(([k, l]) => (
            <button key={k} className={preset === k ? 'on' : ''} onClick={() => setPreset(k)}>
              {l}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <>
            <input type="date" className="inp" style={{ width: 'auto' }} value={from} onChange={(e) => setFrom(e.target.value)} />
            <span style={{ color: 'var(--dim)' }}>→</span>
            <input type="date" className="inp" style={{ width: 'auto' }} value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        )}
        <select className="slct" style={{ width: 'auto' }} value={job} onChange={(e) => setJob(e.target.value)}>
          <option value="">All job roles</option>
          {(jobs ?? []).map((j) => (
            <option key={j.id} value={j.id}>
              {j.job_role}
            </option>
          ))}
        </select>
        <select className="slct" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All candidate statuses</option>
          {(candidates ? Array.from(new Set(candidates.map((c) => c.candidate_status))) : []).map((s) => (
            <option key={s} value={s}>
              {resolveStatus(s).label}
            </option>
          ))}
        </select>
      </div>

      <div className="ib-card">
        <div className="ib-card-head">
          <span className="ib-card-title">Preview · {label}</span>
          <span className="ib-card-title" style={{ color: 'var(--orange)' }}>
            {rows.length} row{rows.length === 1 ? '' : 's'}
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="empty" style={{ border: 0, margin: 0 }}>
            <div className="e-big">Nothing in this range</div>
            <div style={{ fontSize: 13 }}>Widen the date filter or clear the role / status filters.</div>
          </div>
        ) : (
          <div className="tbl-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Job role</th>
                  <th>Total exp</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((c) => {
                  const roles = rolesById.get(c.id) ?? [];
                  return (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 500 }}>{c.full_name || '—'}</td>
                      <td>{roles.length ? roles.join(', ') : 'Untagged'}</td>
                      <td className="mono">{c.total_experience_years ? `${Number(c.total_experience_years)} y` : '—'}</td>
                      <td>{c.current_location || '—'}</td>
                      <td>
                        <Chip status={c.candidate_status} />
                      </td>
                      <td className="mono">{formatDate(c.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 200 && (
          <div className="ib-card-body" style={{ borderTop: '1px solid var(--line)' }}>
            <span className="field-hint">Preview capped at 200 rows — the exported file contains all {rows.length}.</span>
          </div>
        )}
      </div>
      <p className="field-hint" style={{ marginTop: 10 }}>
        Preview shows list-level fields. The exported file adds recruiter, salary, notice period, last
        working day, interview date and offer status (the full BRD column set) and honours the date
        range above.
      </p>
    </div>
  );
}

function JobReport() {
  const toast = useToast();
  const exportReport = useExportReport();
  const { data: jobs } = useAllJobs();

  const [preset, setPreset] = useState<Preset>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');

  const range = presetRange(preset, from, to);

  // Jobs in range (backend filters the job report on Job.created_at) — the status
  // filter only refines this preview, never the exported file.
  const inRange = useMemo(
    () =>
      (jobs ?? []).filter((j) => {
        const ref = new Date(j.created_at);
        return ref >= range.from && ref <= range.to;
      }),
    [jobs, range.from, range.to],
  );

  const rows = useMemo(
    () => inRange.filter((j) => !status || j.job_status === status),
    [inRange, status],
  );

  // Jobs-by-status summary over the in-range set (unaffected by the status filter),
  // in the canonical Open / In Progress / Closed / On Hold order + a total.
  const summary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of inRange) counts.set(j.job_status, (counts.get(j.job_status) ?? 0) + 1);
    const parts = Object.keys(JOB_STATUS).map((key) => ({
      key,
      label: JOB_STATUS[key].label,
      count: counts.get(key) ?? 0,
    }));
    return { parts, total: inRange.length };
  }, [inRange]);

  const runExport = (fmt: string) => {
    if (preset === 'custom' && (!from || !to)) {
      toast.error('Pick a start and end date.');
      return;
    }
    const df =
      preset === 'custom'
        ? { date_filter: 'CUSTOM', start: from, end: to }
        : preset === 'all'
          ? { date_filter: 'CUSTOM', start: '2000-01-01', end: new Date().toISOString().slice(0, 10) }
          : presetToDateFilter(preset);
    exportReport.mutate(
      { report_type: 'job', format: fmt, ...df },
      {
        onSuccess: () => toast.success('Report downloaded.'),
        onError: (err) => toast.error('Export failed', apiErrorMessage(err)),
      },
    );
  };

  const label =
    preset === 'all'
      ? 'All time'
      : `${formatDate(range.from.toISOString())} – ${formatDate(range.to.toISOString())}`;

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <span className="ib-label">Filters honour the date range in the file; status refines the preview.</span>
        <ExportButtons onExport={runExport} busy={exportReport.isPending} />
      </div>

      <div className="filters">
        <div className="seg">
          {PRESETS.map(([k, l]) => (
            <button key={k} className={preset === k ? 'on' : ''} onClick={() => setPreset(k)}>
              {l}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <>
            <input type="date" className="inp" style={{ width: 'auto' }} value={from} onChange={(e) => setFrom(e.target.value)} />
            <span style={{ color: 'var(--dim)' }}>→</span>
            <input type="date" className="inp" style={{ width: 'auto' }} value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        )}
        <select className="slct" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All job statuses</option>
          {Object.keys(JOB_STATUS).map((k) => (
            <option key={k} value={k}>
              {JOB_STATUS[k].label}
            </option>
          ))}
        </select>
      </div>

      <MetricRow className="mb-7">
        {summary.parts.map((p) => (
          <MetricTile key={p.key} label={p.label} value={p.count} hot={p.key === 'OPEN'} />
        ))}
        <MetricTile label="Total jobs" value={summary.total} />
      </MetricRow>

      <div className="ib-card">
        <div className="ib-card-head">
          <span className="ib-card-title">Preview · {label}</span>
          <span className="ib-card-title" style={{ color: 'var(--orange)' }}>
            {rows.length} row{rows.length === 1 ? '' : 's'}
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="empty" style={{ border: 0, margin: 0 }}>
            <div className="e-big">No jobs in this range</div>
            <div style={{ fontSize: 13 }}>Widen the date filter or clear the status filter.</div>
          </div>
        ) : (
          <div className="tbl-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>Job role</th>
                  <th>Department</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Openings</th>
                  <th>Candidates</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((j) => (
                  <tr key={j.id}>
                    <td className="mono">{j.job_id}</td>
                    <td style={{ fontWeight: 500 }}>{j.job_role || '—'}</td>
                    <td>{j.department || '—'}</td>
                    <td>{j.location || '—'}</td>
                    <td>
                      <Chip status={j.job_status} />
                    </td>
                    <td className="mono">{j.number_of_openings}</td>
                    <td className="mono">{j.candidate_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="field-hint" style={{ marginTop: 10 }}>
        The exported file lists every job in the range plus a “Jobs by Status” summary
        (Open / In Progress / Closed / On Hold + total).
      </p>
    </div>
  );
}

function OpeningsReport() {
  const toast = useToast();
  const exportReport = useExportReport();
  const { data: jobs } = useAllJobs();
  const [grain, setGrain] = useState<Grain>('month');

  const { data: joined } = useQuery({
    queryKey: ['recruitment-status', 'joined'],
    queryFn: () =>
      fetchAllPages<RecruitmentStatusEntry>('/recruitment-status/', { new_status: 'JOINED' }, 5000),
  });

  const rows = useMemo(
    () => openingsRows(jobs ?? [], joined ?? [], grain),
    [jobs, joined, grain],
  );

  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + pick(r), 0);
  const last = rows[rows.length - 1];

  const runExport = (fmt: string) => {
    exportReport.mutate(
      { report_type: 'openings', format: fmt, date_filter: 'THIS_YEAR', grain },
      {
        onSuccess: () => toast.success('Report downloaded.'),
        onError: (err) => toast.error('Export failed', apiErrorMessage(err)),
      },
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div className="seg">
          {GRAINS.map(([k, l]) => (
            <button key={k} className={grain === k ? 'on' : ''} onClick={() => setGrain(k)}>
              {l}
            </button>
          ))}
        </div>
        <ExportButtons onExport={runExport} busy={exportReport.isPending} />
      </div>

      <MetricRow className="mb-7">
        <MetricTile label="Openings posted" value={sum((r) => r.openingsPosted)} />
        <MetricTile label="Openings closed" value={sum((r) => r.openingsClosed)} />
        <MetricTile label="Openings still open" value={last?.openingsOpen ?? 0} hot />
        <MetricTile label="Candidates joined" value={sum((r) => r.joined)} />
      </MetricRow>

      <div className="ib-card">
        <div className="ib-card-head">
          <span className="ib-card-title">{grain}ly openings</span>
          <span className="ib-card-title" style={{ color: 'var(--orange)' }}>
            {rows.length} periods
          </span>
        </div>
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Period</th>
                <th>Roles posted</th>
                <th>Openings posted</th>
                <th>Roles closed</th>
                <th>Openings closed</th>
                <th>Roles still open</th>
                <th>Openings still open</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const dead = !r.rolesPosted && !r.rolesClosed && !r.rolesOpen;
                return (
                  <tr key={r.period} style={dead ? { opacity: 0.42 } : undefined}>
                    <td>{r.period}</td>
                    <td className="mono">{r.rolesPosted || '·'}</td>
                    <td className="mono">{r.openingsPosted || '·'}</td>
                    <td className="mono">{r.rolesClosed || '·'}</td>
                    <td className="mono">{r.openingsClosed || '·'}</td>
                    <td className="mono">{r.rolesOpen || '·'}</td>
                    <td
                      className="mono"
                      style={r.openingsOpen ? { color: 'var(--orange)', fontWeight: 700 } : undefined}
                    >
                      {r.openingsOpen || '·'}
                    </td>
                    <td className="mono">{r.joined || '·'}</td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: '1px solid var(--line-2)' }}>
                <td style={{ fontWeight: 600 }}>Total</td>
                <td className="mono" style={{ fontWeight: 700 }}>{sum((r) => r.rolesPosted)}</td>
                <td className="mono" style={{ fontWeight: 700 }}>{sum((r) => r.openingsPosted)}</td>
                <td className="mono" style={{ fontWeight: 700 }}>{sum((r) => r.rolesClosed)}</td>
                <td className="mono" style={{ fontWeight: 700 }}>{sum((r) => r.openingsClosed)}</td>
                <td className="mono" style={{ color: 'var(--dim)' }}>now {last?.rolesOpen ?? 0}</td>
                <td className="mono" style={{ color: 'var(--orange)', fontWeight: 700 }}>
                  now {last?.openingsOpen ?? 0}
                </td>
                <td className="mono" style={{ fontWeight: 700 }}>{sum((r) => r.joined)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p className="field-hint" style={{ marginTop: 10 }}>
        Last {grain === 'year' ? '5 years' : `12 ${grain}s`} · “still open” is the position at the
        close of each period.
      </p>
    </div>
  );
}
