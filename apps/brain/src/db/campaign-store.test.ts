import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { account } from './schema.js';
import { CampaignStore } from './campaign-store.js';

function freshDb(): BetterSQLite3Database {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle') });
  db.insert(account).values({ id: 'a1', name: 'Me', liProfileUrl: null, createdAt: 1 }).run();
  return db;
}

describe('CampaignStore', () => {
  let db: BetterSQLite3Database; let cs: CampaignStore;
  beforeEach(() => { db = freshDb(); cs = new CampaignStore(db); });

  it('creates a campaign + nodes + edges and resolves the graph', () => {
    const cid = cs.createCampaign('a1', 'Warm-up', 'running', 1);
    const n1 = cs.addNode(cid, 'visit', {}, 1);
    const n2 = cs.addNode(cid, 'wait', { waitMs: 60000 }, 1);
    const n3 = cs.addNode(cid, 'end', {}, 1);
    cs.addEdge(cid, n1, n2, 'default', 1);
    cs.addEdge(cid, n2, n3, 'default', 1);

    expect(cs.getCampaign(cid)?.status).toBe('running');
    expect(cs.listNodes(cid)).toHaveLength(3);
    expect(cs.getNode(n1)?.type).toBe('visit');
    expect(cs.getNode(n2)?.config).toEqual({ waitMs: 60000 }); // JSON round-trips
    expect(cs.outgoingEdge(n1, 'default')?.toNodeId).toBe(n2);
    expect(cs.outgoingEdge(n3, 'default')).toBeUndefined();
    expect(cs.startNode(cid)?.id).toBe(n1); // n1 has no incoming edge
  });

  it('outgoingEdge falls back to a default edge when the asked condition is absent', () => {
    const cid = cs.createCampaign('a1', 'C', 'running', 1);
    const a = cs.addNode(cid, 'connect', {}, 1);
    const b = cs.addNode(cid, 'end', {}, 1);
    cs.addEdge(cid, a, b, 'default', 1);
    expect(cs.outgoingEdge(a, 'accepted')?.toNodeId).toBe(b); // falls back to default
  });

  it('setStatus updates status', () => {
    const cid = cs.createCampaign('a1', 'C', 'draft', 1);
    cs.setStatus(cid, 'running', 2);
    expect(cs.getCampaign(cid)?.status).toBe('running');
  });
});
