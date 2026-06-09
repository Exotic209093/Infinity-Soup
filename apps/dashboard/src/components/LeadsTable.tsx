import type { LeadSummary } from '@aura/contract';

export function LeadsTable({
  leads,
  selectedId,
  onSelect,
}: {
  leads: LeadSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <table className="leads">
      <thead>
        <tr>
          <th>Name</th>
          <th>Company</th>
          <th>Location</th>
          <th>Sections</th>
        </tr>
      </thead>
      <tbody>
        {leads.map((l) => (
          <tr
            key={l.id}
            className={l.id === selectedId ? 'sel' : ''}
            onClick={() => onSelect(l.id)}
          >
            <td>
              <div className="nm">{l.fullName}</div>
              <div className="muted">{l.currentTitle}</div>
            </td>
            <td>{l.currentCompany}</td>
            <td>{l.location}</td>
            <td className="chips">
              <span>{l.expCount} exp</span>
              <span>{l.eduCount} edu</span>
              <span>{l.skillCount} skills</span>
              {l.postCount > 0 && <span>{l.postCount} posts</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
