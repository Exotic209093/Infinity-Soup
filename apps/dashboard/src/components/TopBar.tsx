export function TopBar({
  count,
  query,
  onQuery,
}: {
  count: number;
  query: string;
  onQuery: (q: string) => void;
}) {
  return (
    <div className="aura-top">
      <h3>Leads · {count}</h3>
      <div className="tools">
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
