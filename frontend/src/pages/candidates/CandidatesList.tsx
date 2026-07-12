import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, MapPin, Search, UserPlus, Users } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Pagination } from '@/components/common/Pagination';
import {
  Avatar,
  Button,
  Card,
  Input,
  Select,
  Skeleton,
  StatusPill,
  Table,
  type Column,
} from '@/components/ui';
import { CANDIDATE_STATUS_OPTIONS } from '@/constants/choices';
import { useCandidates } from '@/hooks/useCandidates';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatYears } from '@/lib/format';
import type { CandidateListItem } from '@/types/api';

export default function CandidatesList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [location, setLocation] = useState('');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading, isError, refetch } = useCandidates({
    page,
    search: debouncedSearch,
    candidate_status: status,
    current_location: location,
  });

  const locationOptions = useMemo(() => {
    const set = new Set<string>();
    (data?.results ?? []).forEach((c) => c.current_location && set.add(c.current_location));
    if (location) set.add(location);
    return [...set].sort().map((l) => ({ value: l, label: l }));
  }, [data, location]);

  const resetPage = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  const columns: Column<CandidateListItem>[] = [
    {
      key: 'name',
      header: 'Candidate',
      render: (c) => (
        <div className="flex items-center gap-3">
          <Avatar name={c.full_name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{c.full_name}</p>
            <p className="truncate text-2xs text-muted">{c.email || c.mobile || '—'}</p>
          </div>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (c) => <StatusPill status={c.candidate_status} /> },
    {
      key: 'experience',
      header: 'Experience',
      render: (c) => formatYears(c.total_experience_years),
    },
    {
      key: 'company',
      header: 'Current company',
      render: (c) => (
        <span className="inline-flex items-center gap-1.5 text-muted">
          <Briefcase className="h-3.5 w-3.5" />
          {c.current_company || '—'}
        </span>
      ),
    },
    {
      key: 'location',
      header: 'Location',
      render: (c) => (
        <span className="inline-flex items-center gap-1.5 text-muted">
          <MapPin className="h-3.5 w-3.5" />
          {c.current_location || '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Talent"
        eyebrowIcon={Users}
        title="Candidates"
        description="Browse, filter and manage every candidate profile."
        actions={
          <Button onClick={() => navigate('/candidates/new')}>
            <UserPlus className="h-4 w-4" />
            Add Candidate
          </Button>
        }
      />

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Input
              placeholder="Search by name, email, mobile, skills…"
              value={search}
              onChange={(e) => resetPage(setSearch)(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
            />
          </div>
          <Select
            options={CANDIDATE_STATUS_OPTIONS}
            placeholder="All statuses"
            value={status}
            onChange={(e) => resetPage(setStatus)(e.target.value)}
          />
          <Select
            options={locationOptions}
            placeholder="All locations"
            value={location}
            onChange={(e) => resetPage(setLocation)(e.target.value)}
          />
        </div>
      </Card>

      {isError ? (
        <Card className="p-4 text-sm text-status-rejected">
          Couldn't load candidates.{' '}
          <button onClick={() => refetch()} className="font-semibold underline">
            Retry
          </button>
        </Card>
      ) : isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <>
          <Table
            columns={columns}
            data={data?.results ?? []}
            rowKey={(c) => c.id}
            onRowClick={(c) => navigate(`/candidates/${c.id}`)}
            empty={{
              title: 'No candidates found',
              description: 'Upload a resume to add your first candidate.',
              icon: <Users className="h-7 w-7" />,
            }}
          />
          {data && data.count > 0 && (
            <Pagination count={data.count} page={page} onPageChange={setPage} />
          )}
        </>
      )}
    </div>
  );
}
