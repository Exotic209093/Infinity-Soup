import type { LeadDetail } from '@aura/contract';

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
      <div className="loc">{lead.location}</div>

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
