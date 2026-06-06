import { useState } from 'react';
import { Sidebar, type Tab } from './components/Sidebar.js';
import { OverviewView } from './components/OverviewView.js';
import { LeadsView } from './components/LeadsView.js';
import { CampaignsView } from './components/CampaignsView.js';

export function App() {
  const [tab, setTab] = useState<Tab>('Overview');

  return (
    <div className="aura-shell">
      <Sidebar active={tab} onNavigate={setTab} />
      <div className="aura-main">
        {tab === 'Overview' && <OverviewView />}
        {tab === 'Leads' && <LeadsView />}
        {tab === 'Campaigns' && <CampaignsView />}
      </div>
    </div>
  );
}
