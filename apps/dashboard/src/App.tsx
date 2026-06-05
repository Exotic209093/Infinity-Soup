import { useEffect, useMemo, useState } from 'react';
import type { LeadSummary, LeadDetail } from '@aura/contract';
import { fetchLeads, fetchLead } from './api.js';
import { Sidebar } from './components/Sidebar.js';
import { TopBar } from './components/TopBar.js';
import { LeadsTable } from './components/LeadsTable.js';
import { LeadDrawer } from './components/LeadDrawer.js';

export function App() {
  const [leads, setLeads] = useState<LeadSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetchLeads()
      .then((ls) => {
        setLeads(ls);
        if (ls[0]) setSelectedId(ls[0].id);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedId) fetchLead(selectedId).then(setDetail).catch(console.error);
  }, [selectedId]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return leads.filter(
      (l) =>
        !q ||
        l.fullName.toLowerCase().includes(q) ||
        l.currentCompany.toLowerCase().includes(q),
    );
  }, [leads, query]);

  return (
    <div className="aura-shell">
      <Sidebar />
      <div className="aura-main">
        <TopBar count={filtered.length} query={query} onQuery={setQuery} />
        <div className="aura-body">
          <LeadsTable
            leads={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <LeadDrawer lead={detail} />
        </div>
      </div>
    </div>
  );
}
