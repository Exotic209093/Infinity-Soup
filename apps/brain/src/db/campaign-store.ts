import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { campaign, node, edge, type CampaignRow, type NodeRow, type EdgeRow } from './schema.js';

export class CampaignStore {
  constructor(private db: BetterSQLite3Database) {}

  createCampaign(accountId: string, name: string, status: string, now: number): string {
    const id = randomUUID();
    this.db.insert(campaign).values({ id, accountId, name, status, createdAt: now, updatedAt: now }).run();
    return id;
  }
  setStatus(id: string, status: string, now: number): void {
    this.db.update(campaign).set({ status, updatedAt: now }).where(eq(campaign.id, id)).run();
  }
  getCampaign(id: string): CampaignRow | undefined {
    return this.db.select().from(campaign).where(eq(campaign.id, id)).get();
  }

  addNode(campaignId: string, type: string, config: Record<string, unknown>, now: number, x = 0, y = 0): string {
    const id = randomUUID();
    this.db.insert(node).values({ id, campaignId, type, config, x, y }).run();
    return id;
  }
  addEdge(campaignId: string, fromNodeId: string, toNodeId: string, condition: string, now: number): string {
    const id = randomUUID();
    this.db.insert(edge).values({ id, campaignId, fromNodeId, toNodeId, condition }).run();
    return id;
  }

  getNode(id: string): NodeRow | undefined {
    return this.db.select().from(node).where(eq(node.id, id)).get();
  }
  listNodes(campaignId: string): NodeRow[] {
    return this.db.select().from(node).where(eq(node.campaignId, campaignId)).all();
  }
  listEdges(campaignId: string): EdgeRow[] {
    return this.db.select().from(edge).where(eq(edge.campaignId, campaignId)).all();
  }

  /** The outgoing edge matching `condition`, falling back to a 'default' edge. */
  outgoingEdge(nodeId: string, condition: string): EdgeRow | undefined {
    return this.db.select().from(edge).where(and(eq(edge.fromNodeId, nodeId), eq(edge.condition, condition))).get()
      ?? this.db.select().from(edge).where(and(eq(edge.fromNodeId, nodeId), eq(edge.condition, 'default'))).get();
  }

  /** The start node = a node in the campaign with no incoming edge. */
  startNode(campaignId: string): NodeRow | undefined {
    const nodes = this.listNodes(campaignId);
    const targets = new Set(this.listEdges(campaignId).map((e) => e.toNodeId));
    return nodes.find((n) => !targets.has(n.id));
  }
}
