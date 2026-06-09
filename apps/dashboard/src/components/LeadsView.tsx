import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LeadSummary, LeadDetail } from '@aura/contract';
import { fetchLeads, fetchLead, enqueueScrape } from '../api.js';
import { TopBar } from './TopBar.js';
import { LeadsTable } from './LeadsTable.js';
import { LeadDrawer } from './LeadDrawer.js';

const PROFILE_URL_RE = /^https:\/\/(www\.)?linkedin\.com\/in\/[^/?#]+/;

export function LeadsView() {
  const [leads, setLeads] = useState<LeadSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<{ text: string; err: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The post-scrape setTimeout polls need the *current* selection, not the value captured at
  // enqueue time — keep it in a ref the closures can read.
  const selectedRef = useRef<string | null>(null);
  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);

  useEffect(() => {
    fetchLeads()
      .then((ls) => {
        setLeads(ls);
        if (ls[0]) setSelectedId(ls[0].id);
      })
      .catch(console.error);
  }, []);

  // Out-of-order guard: clicking A then B quickly must not let A's slower response paint the
  // drawer while row B is selected. Only the fetch for the still-selected lead may win.
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let ignore = false;
    setDetail(null); // avoid flashing the previous lead while the new one loads
    fetchLead(selectedId)
      .then((d) => { if (!ignore) setDetail(d); })
      .catch((e) => { if (!ignore) console.error(e); });
    return () => { ignore = true; };
  }, [selectedId]);

  // Auto-dismiss the status banner so it doesn't linger (errors clear faster than successes).
  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(null), status.err ? 12_000 : 60_000);
    return () => clearTimeout(t);
  }, [status]);

  // After a scrape lands: refetch the list, auto-select a lead that wasn't there before (a brand
  // new lead), otherwise refresh the open lead's detail so a re-scrape's new posts/fields appear.
  const pollAfterScrape = useCallback((knownIds: Set<string>) => {
    fetchLeads()
      .then((ls) => {
        setLeads(ls);
        const fresh = ls.find((l) => !knownIds.has(l.id));
        if (fresh) setSelectedId(fresh.id);
        else if (selectedRef.current) fetchLead(selectedRef.current).then(setDetail).catch(console.error);
      })
      .catch(console.error);
  }, []);

  async function onScrape(url: string) {
    if (!PROFILE_URL_RE.test(url)) {
      setStatus({ text: 'That doesn’t look like a linkedin.com/in/… profile URL', err: true });
      return;
    }
    setSubmitting(true);
    const knownIds = new Set(leads.map((l) => l.id));
    try {
      const { delivered } = await enqueueScrape(url);
      if (delivered === false) {
        setStatus({ text: 'Queued, but no extension is connected — open AURA on a LinkedIn tab, then retry.', err: true });
      } else {
        setStatus({ text: 'Queued ✓ — scraping profile + posts (up to ~60s). The lead appears here automatically.', err: false });
        setTimeout(() => pollAfterScrape(knownIds), 15_000);
        setTimeout(() => pollAfterScrape(knownIds), 35_000);
        setTimeout(() => pollAfterScrape(knownIds), 55_000);
      }
    } catch (e) {
      setStatus({ text: `Failed to queue: ${e instanceof Error ? e.message : String(e)} (is the brain running?)`, err: true });
    } finally {
      setSubmitting(false);
    }
  }

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
    <>
      <TopBar count={filtered.length} query={query} onQuery={setQuery} onScrape={onScrape} submitting={submitting} />
      {status && (
        <div className={`scrape-banner${status.err ? ' err' : ''}`}>
          {status.text}
          <button className="scrape-banner__x" onClick={() => setStatus(null)} aria-label="dismiss">×</button>
        </div>
      )}
      <div className="aura-body">
        <LeadsTable
          leads={filtered}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <LeadDrawer lead={detail} />
      </div>
    </>
  );
}
