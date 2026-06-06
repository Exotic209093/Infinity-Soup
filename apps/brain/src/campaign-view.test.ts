import { describe, it, expect } from 'vitest';
import { enrollmentCounts, toCampaignSummary, toEnrollmentView, toCampaignDetail } from './campaign-view.js';
import type { CampaignRow, NodeRow, EdgeRow, EnrollmentRow } from './db/schema.js';

const campaign: CampaignRow = { id: 'c1', accountId: 'a1', name: 'Outreach', status: 'running', createdAt: 1, updatedAt: 2 };
const nodes: NodeRow[] = [
  { id: 'n1', campaignId: 'c1', type: 'connect', config: { msg: 'hi' }, x: 0, y: 0 },
  { id: 'n2', campaignId: 'c1', type: 'message', config: {}, x: 1, y: 0 },
];
const edges: EdgeRow[] = [{ id: 'e1', campaignId: 'c1', fromNodeId: 'n1', toNodeId: 'n2', condition: 'accepted' }];

const enr = (id: string, state: string, currentNodeId: string | null = 'n1'): EnrollmentRow => ({
  id, campaignId: 'c1', leadId: `lead-${id}`, currentNodeId, state, connectionState: 'none',
  nextRunAt: 100, pendingJobId: null, attempts: 0, repliedAt: null, createdAt: 1, updatedAt: 2,
});

describe('campaign-view mappers', () => {
  it('enrollmentCounts tallies each state and total', () => {
    const c = enrollmentCounts([enr('1', 'active'), enr('2', 'active'), enr('3', 'dispatched'), enr('4', 'done'), enr('5', 'failed')]);
    expect(c).toEqual({ active: 2, dispatched: 1, done: 1, failed: 1, total: 5 });
  });

  it('enrollmentCounts ignores unknown states but still counts them in total', () => {
    const c = enrollmentCounts([enr('1', 'active'), enr('2', 'paused')]);
    expect(c).toEqual({ active: 1, dispatched: 0, done: 0, failed: 0, total: 2 });
  });

  it('toCampaignSummary carries name/status, node count and enrollment counts', () => {
    const s = toCampaignSummary(campaign, nodes, [enr('1', 'active'), enr('2', 'dispatched'), enr('3', 'done'), enr('4', 'failed')]);
    expect(s).toEqual({
      id: 'c1', name: 'Outreach', status: 'running', nodeCount: 2,
      counts: { active: 1, dispatched: 1, done: 1, failed: 1, total: 4 },
    });
  });

  it('toEnrollmentView projects the lead name + node type', () => {
    const v = toEnrollmentView(enr('1', 'active'), 'connect', 'Jane Doe');
    expect(v).toEqual({
      id: '1', leadId: 'lead-1', leadName: 'Jane Doe', state: 'active',
      currentNodeType: 'connect', connectionState: 'none', nextRunAt: 100, attempts: 0,
    });
  });

  it('toCampaignDetail bundles nodes, edges and enrollment views', () => {
    const ev = toEnrollmentView(enr('1', 'active'), 'connect', 'Jane Doe');
    const d = toCampaignDetail(campaign, nodes, edges, [ev]);
    expect(d.id).toBe('c1');
    expect(d.name).toBe('Outreach');
    expect(d.status).toBe('running');
    expect(d.nodes).toEqual([
      { id: 'n1', type: 'connect', config: { msg: 'hi' } },
      { id: 'n2', type: 'message', config: {} },
    ]);
    expect(d.edges).toEqual([{ id: 'e1', fromNodeId: 'n1', toNodeId: 'n2', condition: 'accepted' }]);
    expect(d.enrollments).toEqual([ev]);
  });
});
