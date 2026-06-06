import { useEffect, useState } from 'react';
import type { CampaignSummary, CampaignDetail } from '@aura/contract';
import { fetchCampaigns, fetchCampaign } from '../api.js';
import { relativeTime } from './time.js';

/** Map a campaign status to a coloured pill tone. */
function campaignTone(status: string): 'running' | 'paused' | 'draft' | 'done' {
  const s = status.toLowerCase();
  if (['running', 'active', 'live'].includes(s)) return 'running';
  if (['paused', 'pausing'].includes(s)) return 'paused';
  if (['done', 'completed', 'finished', 'archived'].includes(s)) return 'done';
  return 'draft';
}

function StatusPill({ status }: { status: string }) {
  return <span className={`pill pill-${campaignTone(status)}`}>{status}</span>;
}

/** Order nodes by following edges from the node that is never a target. */
function orderedNodeTypes(detail: CampaignDetail): string[] {
  const { nodes, edges } = detail;
  if (nodes.length === 0) return [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const targets = new Set(edges.map((e) => e.toNodeId));
  const start = nodes.find((n) => !targets.has(n.id)) ?? nodes[0];
  const out: string[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = start.id;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const node = byId.get(cur);
    if (node) out.push(node.type);
    cur = edges.find((e) => e.fromNodeId === cur)?.toNodeId;
  }
  // Append any nodes not reached by the linear walk (branches/cycles).
  for (const n of nodes) if (!seen.has(n.id)) out.push(n.type);
  return out;
}

function CampaignDrawer({ campaign }: { campaign: CampaignDetail | null }) {
  if (!campaign) {
    return (
      <div className="drawer">
        <div className="empty-state">
          <p className="muted">Select a campaign to see its sequence.</p>
        </div>
      </div>
    );
  }

  const flow = orderedNodeTypes(campaign);

  return (
    <div className="drawer">
      <h4>{campaign.name}</h4>
      <div className="sub">
        <StatusPill status={campaign.status} />
      </div>

      <div className="lbl">Sequence</div>
      {campaign.nodes.length === 0 ? (
        <div className="row muted">No nodes defined.</div>
      ) : (
        <>
          <div className="seq-flow">
            {flow.map((t, i) => (
              <span key={i} className="seq-step">
                {t}
                {i < flow.length - 1 && <span className="seq-arrow">→</span>}
              </span>
            ))}
          </div>
          {campaign.edges.length > 0 && (
            <div className="seq-edges">
              {campaign.edges.map((e) => {
                const from = campaign.nodes.find((n) => n.id === e.fromNodeId);
                const to = campaign.nodes.find((n) => n.id === e.toNodeId);
                return (
                  <div className="seq-edge" key={e.id}>
                    <b>{from?.type ?? e.fromNodeId}</b>
                    <span className="seq-arrow">→</span>
                    <b>{to?.type ?? e.toNodeId}</b>
                    {e.condition && e.condition !== 'always' && (
                      <span className="muted"> ({e.condition})</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <div className="lbl">Enrollments · {campaign.enrollments.length}</div>
      {campaign.enrollments.length === 0 ? (
        <div className="row muted">No leads enrolled yet.</div>
      ) : (
        <table className="enroll">
          <thead>
            <tr>
              <th>Lead</th>
              <th>State</th>
              <th>Node</th>
              <th>Att.</th>
              <th>Next run</th>
            </tr>
          </thead>
          <tbody>
            {campaign.enrollments.map((en) => (
              <tr key={en.id}>
                <td className="nm">{en.leadName}</td>
                <td>{en.state}</td>
                <td className="muted">{en.currentNodeType}</td>
                <td>{en.attempts}</td>
                <td className="muted">{relativeTime(en.nextRunAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function CampaignsView() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);

  useEffect(() => {
    fetchCampaigns()
      .then((cs) => {
        setCampaigns(cs);
        if (cs[0]) setSelectedId(cs[0].id);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedId) fetchCampaign(selectedId).then(setDetail).catch(console.error);
  }, [selectedId]);

  return (
    <>
      <div className="aura-top">
        <h3>Campaigns · {campaigns.length}</h3>
      </div>
      <div className="aura-body">
        {campaigns.length === 0 ? (
          <div className="drawer">
            <div className="empty-state">
              <p className="muted">No campaigns yet.</p>
              <p className="muted">
                Seed one with <code>pnpm --filter @aura/brain campaign:seed</code>
              </p>
            </div>
          </div>
        ) : (
          <>
            <table className="leads">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Nodes</th>
                  <th>Enrollments</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr
                    key={c.id}
                    className={c.id === selectedId ? 'sel' : ''}
                    onClick={() => setSelectedId(c.id)}
                  >
                    <td className="nm">{c.name}</td>
                    <td>
                      <StatusPill status={c.status} />
                    </td>
                    <td>{c.nodeCount}</td>
                    <td className="chips">
                      <span>{c.counts.active} active</span>
                      <span>{c.counts.done} done</span>
                      {c.counts.failed > 0 && (
                        <span className="chip-bad">{c.counts.failed} failed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <CampaignDrawer campaign={detail} />
          </>
        )}
      </div>
    </>
  );
}
