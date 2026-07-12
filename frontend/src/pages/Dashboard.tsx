import {
  BadgeCheck,
  Briefcase,
  CalendarClock,
  DoorClosed,
  DoorOpen,
  LayoutGrid,
  UserCheck,
  UserX,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageHeader } from '@/components/common/PageHeader';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { ChartCard } from '@/components/dashboard/ChartCard';
import { ChartTooltip } from '@/components/dashboard/ChartTooltip';
import { Button, Card, EmptyState } from '@/components/ui';
import { useDashboardStats } from '@/hooks/useDashboard';
import { resolveStatus } from '@/constants/statuses';
import type { DashboardKpis, DepartmentRow, StatusSeriesRow } from '@/types/api';

interface KpiMeta {
  key: keyof DashboardKpis;
  label: string;
  icon: LucideIcon;
  accent: string;
}

const KPI_META: KpiMeta[] = [
  { key: 'total_jobs', label: 'Total Jobs', icon: Briefcase, accent: '#E8501F' },
  { key: 'open_jobs', label: 'Open Jobs', icon: DoorOpen, accent: '#16A34A' },
  { key: 'closed_jobs', label: 'Closed Jobs', icon: DoorClosed, accent: '#78716C' },
  { key: 'candidates_uploaded', label: 'Candidates', icon: Users, accent: '#2563EB' },
  { key: 'interview_scheduled', label: 'Interviews', icon: CalendarClock, accent: '#D97706' },
  { key: 'offers_released', label: 'Offers', icon: BadgeCheck, accent: '#C2410C' },
  { key: 'joined_candidates', label: 'Joined', icon: UserCheck, accent: '#16A34A' },
  { key: 'rejected_candidates', label: 'Rejected', icon: UserX, accent: '#DC2626' },
];

export default function Dashboard() {
  const { data, isLoading, isError, refetch } = useDashboardStats();

  const pipeline = data?.charts.hiring_pipeline ?? [];
  const jobStatus = data?.charts.job_status ?? [];
  const candidateStatus = data?.charts.candidate_status ?? [];
  const departments = data?.charts.department_hiring ?? [];

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Overview"
        eyebrowIcon={LayoutGrid}
        title="Recruitment Dashboard"
        description="A real-time snapshot of your jobs, candidates and hiring pipeline."
      />

      {isError && (
        <Card className="flex items-center justify-between gap-3 p-4">
          <span className="text-sm text-status-rejected">Couldn&apos;t load dashboard data.</span>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </Card>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPI_META.map((m) => (
          <KpiCard
            key={m.key}
            label={m.label}
            value={data?.kpis[m.key] ?? 0}
            icon={m.icon}
            accent={m.accent}
            loading={isLoading}
          />
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ChartCard
          title="Hiring Pipeline"
          subtitle="Candidates by stage"
          className="xl:col-span-2"
        >
          <PipelineChart rows={pipeline} loading={isLoading} />
        </ChartCard>

        <ChartCard title="Job Status" subtitle="Requisitions by status">
          <StatusDonut rows={jobStatus} loading={isLoading} centerLabel="Jobs" />
        </ChartCard>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ChartCard
          title="Department Hiring"
          subtitle="Jobs vs candidates per department"
          className="xl:col-span-2"
        >
          <DepartmentChart rows={departments} loading={isLoading} />
        </ChartCard>

        <ChartCard title="Candidate Status" subtitle="Profiles by stage">
          <StatusDonut rows={candidateStatus} loading={isLoading} centerLabel="Candidates" />
        </ChartCard>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const CHART_HEIGHT = 300;

function ChartSkeleton() {
  return <div className="shimmer h-[300px] w-full rounded-xl bg-muted/10" />;
}

function PipelineChart({ rows, loading }: { rows: StatusSeriesRow[]; loading: boolean }) {
  if (loading) return <ChartSkeleton />;
  const total = rows.reduce((s, r) => s + r.count, 0);
  if (total === 0) {
    return (
      <EmptyState
        icon={<Users className="h-7 w-7" />}
        title="No candidates yet"
        description="Upload resumes to start populating the hiring pipeline."
      />
    );
  }
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid horizontal={false} stroke="var(--line)" />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={{ fill: 'var(--muted)', fontSize: 12 }}
          axisLine={{ stroke: 'var(--line)' }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={148}
          tick={{ fill: 'var(--muted)', fontSize: 12 }}
          axisLine={{ stroke: 'var(--line)' }}
          tickLine={false}
        />
        <Tooltip cursor={{ fill: 'var(--wash)' }} content={<ChartTooltip />} />
        <Bar dataKey="count" name="Candidates" radius={[0, 6, 6, 0]} barSize={18}>
          {rows.map((r) => (
            <Cell key={r.status} fill={resolveStatus(r.status).color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function DepartmentChart({ rows, loading }: { rows: DepartmentRow[]; loading: boolean }) {
  if (loading) return <ChartSkeleton />;
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Briefcase className="h-7 w-7" />}
        title="No department data"
        description="Create jobs and tag candidates to see hiring by department."
      />
    );
  }
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 4, left: -12 }} barGap={4}>
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis
          dataKey="department"
          tick={{ fill: 'var(--muted)', fontSize: 12 }}
          axisLine={{ stroke: 'var(--line)' }}
          tickLine={false}
          interval={0}
          height={40}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: 'var(--muted)', fontSize: 12 }}
          axisLine={{ stroke: 'var(--line)' }}
          tickLine={false}
        />
        <Tooltip cursor={{ fill: 'var(--wash)' }} content={<ChartTooltip />} />
        <Bar dataKey="jobs" name="Jobs" fill="#E8501F" radius={[5, 5, 0, 0]} barSize={16} />
        <Bar dataKey="candidates" name="Candidates" fill="#2563EB" radius={[5, 5, 0, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function StatusDonut({
  rows,
  loading,
  centerLabel,
}: {
  rows: StatusSeriesRow[];
  loading: boolean;
  centerLabel: string;
}) {
  if (loading) return <ChartSkeleton />;
  const slices = rows.filter((r) => r.count > 0);
  const total = slices.reduce((s, r) => s + r.count, 0);
  if (total === 0) {
    return (
      <EmptyState
        icon={<Briefcase className="h-7 w-7" />}
        title="Nothing to show yet"
        description="Data appears here as your pipeline fills up."
      />
    );
  }
  return (
    <div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={190}>
          <PieChart>
            <Tooltip content={<ChartTooltip />} />
            <Pie
              data={slices}
              dataKey="count"
              nameKey="label"
              innerRadius={58}
              outerRadius={82}
              paddingAngle={2}
              stroke="var(--panel)"
              strokeWidth={2}
            >
              {slices.map((r) => (
                <Cell key={r.status} fill={resolveStatus(r.status).color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold tabular-nums text-ink">{total}</span>
          <span className="text-2xs font-medium uppercase tracking-wide text-muted">
            {centerLabel}
          </span>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {slices.map((r) => (
          <li key={r.status} className="flex items-center gap-2.5 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: resolveStatus(r.status).color }}
            />
            <span className="text-muted">{r.label}</span>
            <span className="ml-auto font-semibold tabular-nums text-ink">{r.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
