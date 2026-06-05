import type { LeadDetail } from '@aura/contract';

function scrapedWhen(ts: number | null): string {
  if (!ts) return '';
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 0) return 'scraped today';
  if (days === 1) return 'scraped yesterday';
  if (days < 30) return `scraped ${days}d ago`;
  return `scraped ${new Date(ts).toLocaleDateString()}`;
}

export function LeadDrawer({ lead }: { lead: LeadDetail | null }) {
  if (!lead) {
    return (
      <div className="drawer">
        <div className="empty-state">
          <p className="muted">Select a lead to see details.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="drawer">
      <h4>{lead.fullName}</h4>
      <div className="sub">
        {[lead.currentTitle, lead.currentCompany].filter(Boolean).join(' @ ')}
      </div>
      <div className="loc">{[lead.location, scrapedWhen(lead.updatedAt)].filter(Boolean).join(' · ')}</div>

      {lead.about && (
        <>
          <div className="lbl">About</div>
          <div className="row">{lead.about}</div>
        </>
      )}

      <div className="lbl">Experience</div>
      {lead.experience.map((e, i) => (
        <div className="row" key={i}>
          <b>{e.title}</b>
          {e.company ? ` · ${e.company}` : ''}
          {' '}
          <span className="muted">{e.dates}</span>
        </div>
      ))}

      <div className="lbl">Education</div>
      {lead.education.map((e, i) => (
        <div className="row" key={i}>
          {e.school} <span className="muted">{e.years}</span>
        </div>
      ))}

      {lead.skills.length > 0 && (
        <>
          <div className="lbl">Skills</div>
          <div className="row">{lead.skills.join(' · ')}</div>
        </>
      )}
    </div>
  );
}
