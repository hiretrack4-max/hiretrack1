import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, Users } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Avatar, Badge, Card, EmptyState, Input, Skeleton, StatusPill } from '@/components/ui';
import { useSearch } from '@/hooks/useSearch';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatYears } from '@/lib/format';

export default function Search() {
  const [params, setParams] = useSearchParams();
  const initial = params.get('q') ?? '';
  const [term, setTerm] = useState(initial);
  const debounced = useDebouncedValue(term);

  // Keep the URL query in sync with the debounced term (shareable results).
  useEffect(() => {
    const current = params.get('q') ?? '';
    if (debounced !== current) {
      if (debounced) setParams({ q: debounced }, { replace: true });
      else setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // React to external navigation (e.g. topbar search) updating ?q=.
  useEffect(() => {
    const q = params.get('q') ?? '';
    setTerm((prev) => (prev === q ? prev : q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const { data, isFetching, isError } = useSearch(debounced);
  const hasQuery = debounced.trim().length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Module 9"
        eyebrowIcon={SearchIcon}
        title="Global Search"
        description="Find candidates by name, email, mobile, skills, job role or recruiter."
      />

      <Card className="p-4">
        <Input
          autoFocus
          placeholder="Search candidates, skills, technologies…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          leftIcon={<SearchIcon className="h-4 w-4" />}
        />
      </Card>

      {!hasQuery ? (
        <Card>
          <EmptyState
            icon={<SearchIcon className="h-7 w-7" />}
            title="Start typing to search"
            description="Results are ranked across candidate profiles, skills and job mappings."
          />
        </Card>
      ) : isError ? (
        <Card className="p-4 text-sm text-status-rejected">Search failed. Try a different term.</Card>
      ) : isFetching && !data ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : data && data.results.length > 0 ? (
        <>
          <p className="text-sm text-muted">
            <span className="font-semibold text-ink">{data.count}</span> result
            {data.count === 1 ? '' : 's'} for{' '}
            <span className="font-semibold text-ink">“{data.query}”</span>
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.results.map((c) => {
              const skills = c.skills_cache
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 5);
              return (
                <Link key={c.id} to={`/candidates/${c.id}`}>
                  <Card interactive className="h-full p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={c.full_name} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{c.full_name}</p>
                          <p className="truncate text-2xs text-muted">
                            {c.current_designation || c.current_company || '—'}
                          </p>
                        </div>
                      </div>
                      <StatusPill status={c.candidate_status} dot={false} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted">
                      {c.email && <span className="truncate">{c.email}</span>}
                      {c.mobile && <span>{c.mobile}</span>}
                      {c.current_location && <span>{c.current_location}</span>}
                      <span>{formatYears(c.total_experience_years)}</span>
                    </div>
                    {skills.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {skills.map((skill) => (
                          <Badge key={skill} tone="brand">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      ) : (
        <Card>
          <EmptyState
            icon={<Users className="h-7 w-7" />}
            title="No candidates found"
            description={`Nothing matched “${debounced}”. Try a different name, skill or job role.`}
          />
        </Card>
      )}
    </div>
  );
}
