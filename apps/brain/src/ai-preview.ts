/**
 * ai:preview <campaignId> <nodeId> <leadId>
 *
 * Renders the outreach text for a given node + lead, using the AI client if
 * ANTHROPIC_API_KEY is set in the environment, else the template fallback.
 * Prints the rendered text and which path was taken (AI | template).
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CampaignStore } from './db/campaign-store.js';
import { LeadStore } from './db/lead-store.js';
import { createAiClient } from './ai/anthropic-client.js';
import { renderText } from './ai/personalize.js';

const [campaignId, nodeId, leadId] = process.argv.slice(2);
if (!campaignId || !nodeId || !leadId) {
  console.error('usage: pnpm --filter @aura/brain ai:preview <campaignId> <nodeId> <leadId>');
  process.exit(1);
}

const sqlite = new Database(join('.aura', 'aura.sqlite'));
sqlite.pragma('foreign_keys = ON');
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle') });

const campaigns = new CampaignStore(db);
const leads = new LeadStore(db);

const node = campaigns.getNode(nodeId);
if (!node) { console.error(`Node not found: ${nodeId}`); process.exit(1); }

const lead = leads.get(leadId);
if (!lead) { console.error(`Lead not found: ${leadId}`); process.exit(1); }

const c = (node.config ?? {}) as Record<string, unknown>;
const template = String(c.text ?? c.note ?? '');
const aiInstruction = typeof c.aiInstruction === 'string' ? c.aiInstruction : undefined;

const ai = createAiClient();
const usingAi = Boolean(aiInstruction && ai);

const text = await renderText({ template, aiInstruction }, lead, ai);

console.log('\n--- Preview ---');
console.log(`Node:    ${nodeId} (type=${node.type})`);
console.log(`Lead:    ${lead.fullName} — ${lead.currentTitle ?? '?'} @ ${lead.currentCompany ?? '?'}`);
console.log(`Path:    ${usingAi ? 'AI (claude-sonnet-4-6)' : 'template'}`);
console.log(`\nText:\n${text}\n`);

sqlite.close();
