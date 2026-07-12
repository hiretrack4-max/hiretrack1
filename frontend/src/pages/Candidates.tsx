import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, CandidateRow, CandidateTableHeader, Select } from '@/components/ui';
import { CandidateDrawer } from '@/components/drawers/CandidateDrawer';
import { UploadDrawer } from '@/components/drawers/UploadDrawer';
import { useCandidates } from '@/hooks/useCandidates';
import { useAllMappings } from '@/hooks/useMappings';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { CANDIDATE_STATUS_OPTIONS } from '@/constants/choices';
import { hasFlag } from '@/lib/candidate';
import type { CandidateListItem } from '@/types/api';
import '@/styles/phase2.css';

export default function Candidates() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search, 300);

  const { data, isLoading } = useCandidates({
    page,
    search: debounced || undefined,
    candidate_status: status || undefined,
    ordering: '-created_at',
  });
  const { data: mappings } = useAllMappings();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Deep-link: /candidates?open=<id> opens that candidate's drawer.
  useEffect(() => {
    const id = params.get('open');
    if (id) {
      setSelected(Number(id));
      setDrawerOpen(true);
      params.delete('open');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  // Candidate id -> tagged job roles (from all mappings).
  const rolesById = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const m of mappings ?? []) {
      const arr = map.get(m.candidate) ?? [];
      arr.push(m.job_role);
      map.set(m.candidate, arr);
    }
    return map;
  }, [mappings]);

  const openCandidate = (id: number) => {
    setSelected(id);
    setDrawerOpen(true);
  };

  const rows = data?.results ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.count / 25)) : 1;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Talent</div>
          <h1>Candidates</h1>
          <p className="page-sub">Upload a resume, tag it to a role, review the parsed profile.</p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>↑ Upload resume</Button>
      </div>

      <div className="filters">
        <div className="search" style={{ maxWidth: 320 }}>
          <span className="mag">⌕</span>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Filter by name, email, skills…"
            autoComplete="off"
          />
        </div>
        <div style={{ minWidth: 200 }}>
          <Select
            options={CANDIDATE_STATUS_OPTIONS}
            placeholder="All statuses"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="ib-card shimmer" style={{ height: 240 }} />
      ) : rows.length === 0 ? (
        <div className="empty">
          <div className="e-big">No candidates found</div>
          <div style={{ fontSize: 13, maxWidth: '46ch', margin: '0 auto' }}>
            Upload a PDF or DOCX resume to auto-fill a profile, or clear the filters above.
          </div>
        </div>
      ) : (
        <div className="ctable">
          <CandidateTableHeader />
          {rows.map((c: CandidateListItem) => {
            const roles = rolesById.get(c.id) ?? [];
            return (
              <CandidateRow
                key={c.id}
                name={c.full_name || 'Unnamed candidate'}
                email={c.email || 'no email'}
                taggedRole={roles[0] ?? null}
                totalExp={c.total_experience_years ? `${Number(c.total_experience_years)} y` : '—'}
                location={c.current_location}
                verifyLocation={hasFlag(c.parse_flags, 'location')}
                currentCtc={undefined}
                onOpen={() => openCandidate(c.id)}
              />
            );
          })}
        </div>
      )}

      {data && data.count > 25 && (
        <div className="flex items-center justify-between" style={{ marginTop: 16 }}>
          <span className="ib-label">
            Page {page} of {totalPages} · {data.count} candidates
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" disabled={!data.previous} onClick={() => setPage((p) => p - 1)}>
              ← Prev
            </Button>
            <Button variant="ghost" size="sm" disabled={!data.next} onClick={() => setPage((p) => p + 1)}>
              Next →
            </Button>
          </div>
        </div>
      )}

      <UploadDrawer
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onCreated={(id) => openCandidate(id)}
      />
      <CandidateDrawer
        open={drawerOpen}
        candidateId={selected}
        onClose={() => setDrawerOpen(false)}
        onDeleted={() => setSelected(null)}
      />
    </div>
  );
}
