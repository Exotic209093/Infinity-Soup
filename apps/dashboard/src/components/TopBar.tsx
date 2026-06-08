import { useState, type FormEvent } from 'react';

export function TopBar({
  count,
  query,
  onQuery,
  onScrape,
  submitting,
}: {
  count: number;
  query: string;
  onQuery: (q: string) => void;
  onScrape: (url: string) => void;
  submitting?: boolean;
}) {
  const [url, setUrl] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const u = url.trim();
    if (u && !submitting) {
      onScrape(u);
      setUrl('');
    }
  };
  return (
    <div className="aura-top">
      <h3>Leads · {count}</h3>
      <div className="tools">
        <form className="add-lead" onSubmit={submit}>
          <input
            className="aura-input"
            placeholder="Add lead by URL — linkedin.com/in/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={submitting}
          />
          <button className="aura-btn" type="submit" disabled={submitting}>
            {submitting ? 'Queuing…' : 'Scrape'}
          </button>
        </form>
        <input
          className="aura-input"
          placeholder="Search name, company…"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
        <a className="aura-btn" href="/leads.csv" download>
          Export CSV
        </a>
      </div>
    </div>
  );
}
