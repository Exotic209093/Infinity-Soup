export type Tab = 'Overview' | 'Leads' | 'Campaigns';

const TABS: Tab[] = ['Overview', 'Leads', 'Campaigns'];
const FUTURE = ['Sequences', 'Settings'];

export function Sidebar({
  active,
  onNavigate,
}: {
  active: Tab;
  onNavigate: (tab: Tab) => void;
}) {
  return (
    <aside className="aura-side">
      <div className="aura-logo">◆ AURA</div>
      <div className="aura-pill">● Brain connected</div>
      <nav className="aura-nav">
        {TABS.map((n) => (
          <button
            key={n}
            type="button"
            className={n === active ? 'active' : ''}
            onClick={() => onNavigate(n)}
          >
            {n}
          </button>
        ))}
        {FUTURE.map((n) => (
          <button key={n} type="button" className="disabled" disabled title="Coming soon">
            {n}
          </button>
        ))}
      </nav>
    </aside>
  );
}
