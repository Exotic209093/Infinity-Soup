const NAV = ['Overview', 'Leads', 'Campaigns', 'Sequences', 'Settings'];

export function Sidebar() {
  return (
    <aside className="aura-side">
      <div className="aura-logo">◆ AURA</div>
      <div className="aura-pill">● Brain connected</div>
      <nav className="aura-nav">
        {NAV.map((n) => (
          <a key={n} className={n === 'Leads' ? 'active' : ''}>
            {n}
          </a>
        ))}
      </nav>
    </aside>
  );
}
