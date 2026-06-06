import type { CampaignSummary, CampaignDetail, EnrollmentView } from '@aura/contract';
import type { CampaignRow, NodeRow, EdgeRow, EnrollmentRow } from './db/schema.js';

/** Tally enrollments by state. `total` is always the array length; unknown states only bump `total`. */
export function enrollmentCounts(enrollments: EnrollmentRow[]) {
  const c = { active: 0, dispatched: 0, done: 0, failed: 0, total: enrollments.length };
  for (const e of enrollments) {
    if (e.state === 'active' || e.state === 'dispatched' || e.state === 'done' || e.state === 'failed') c[e.state]++;
  }
  return c;
}

export function toCampaignSummary(campaign: CampaignRow, nodes: NodeRow[], enrollments: EnrollmentRow[]): CampaignSummary {
  return {
    id: campaign.id, name: campaign.name, status: campaign.status,
    nodeCount: nodes.length, counts: enrollmentCounts(enrollments),
  };
}

export function toEnrollmentView(e: EnrollmentRow, nodeType: string, leadName: string): EnrollmentView {
  return {
    id: e.id, leadId: e.leadId, leadName, state: e.state,
    currentNodeType: nodeType, connectionState: e.connectionState,
    nextRunAt: e.nextRunAt ?? null, attempts: e.attempts,
  };
}

export function toCampaignDetail(campaign: CampaignRow, nodes: NodeRow[], edges: EdgeRow[], enrollmentViews: EnrollmentView[]): CampaignDetail {
  return {
    id: campaign.id, name: campaign.name, status: campaign.status,
    nodes: nodes.map((n) => ({ id: n.id, type: n.type, config: n.config })),
    edges: edges.map((e) => ({ id: e.id, fromNodeId: e.fromNodeId, toNodeId: e.toNodeId, condition: e.condition })),
    enrollments: enrollmentViews,
  };
}
