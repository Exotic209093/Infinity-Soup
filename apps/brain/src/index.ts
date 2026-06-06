import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import fastifyStatic from '@fastify/static';
import { toLeadSummary, toLeadDetail } from './leads-view.js';
import { toCampaignSummary, toCampaignDetail, toEnrollmentView } from './campaign-view.js';
import { leadsToCsv } from './csv.js';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { WebSocketServer } from 'ws';
import { loadConfig } from './config.js';
import { JobStore } from './db/store.js';
import { LeadStore } from './db/lead-store.js';
import { CampaignStore } from './db/campaign-store.js';
import { EnrollmentStore } from './db/enrollment-store.js';
import { SettingStore } from './db/setting-store.js';
import { ensureAccount } from './db/account.js';
import { HandsServer } from './ws/server.js';
import { Dispatcher } from './dispatcher.js';
import { Governor, loadGovernorConfig, startOfDay } from './engine/governor.js';
import { loadBreaker, tripBreaker } from './engine/breaker.js';
import { Engine } from './engine/engine.js';
import { buildHttp } from './http.js';
import { ScrapedProfileSchema } from '@aura/contract';

const DATA_DIR = '.aura';
const config = loadConfig(DATA_DIR);

const sqlite = new Database(join(DATA_DIR, 'aura.sqlite'));
sqlite.pragma('foreign_keys = ON');
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle') }); // src/ -> apps/brain/drizzle
const store = new JobStore(db);
const leadStore = new LeadStore(db);
const campaignStore = new CampaignStore(db);
const enrollmentStore = new EnrollmentStore(db);
const settingStore = new SettingStore(db);
const account = ensureAccount(db, Date.now());

let engine: Engine; // assigned after `dispatcher` below; referenced by hands.onResult (runtime only)

const wss = new WebSocketServer({ port: config.port, path: '/ws' });
const hands = new HandsServer({ wss, token: config.token, onResult: (r) => {
  dispatcher.handleResult(r);
  console.log('[result]', r.jobId, r.status, JSON.stringify(r.observed ?? {}));
  // M1: a successful scrapeProfile carries a ScrapedProfile — validate + persist as a lead.
  if (r.status === 'ok' && r.data && store.get(r.jobId)?.type === 'scrapeProfile') {
    const parsed = ScrapedProfileSchema.safeParse(r.data);
    if (parsed.success) {
      const id = leadStore.upsertProfile(parsed.data, Date.now());
      console.log('[lead]', id, parsed.data.fullName, '|', parsed.data.experience.length, 'exp', parsed.data.education.length, 'edu', parsed.data.skills.length, 'skills');
    } else {
      console.warn('[lead] invalid ScrapedProfile:', parsed.error.issues[0]);
    }
  }
  engine.onResult(r); // M2: advance any enrollment waiting on this job
}});
const dispatcher = new Dispatcher(store, (job) => hands.sendJob(job));
const governor = new Governor(store, loadGovernorConfig(settingStore), {
  accountCreatedAt: account.createdAt,
  breakerTripped: () => loadBreaker(settingStore).tripped,
});
engine = new Engine(campaignStore, enrollmentStore, leadStore, governor, dispatcher, () => randomUUID(), Date.now, (reason, now) => {
  tripBreaker(settingStore, reason, now);
  console.warn('[breaker] TRIPPED:', reason, '— dispatch halted until reset (pnpm --filter @aura/brain breaker:reset)');
});
engine.reconcile(Date.now()); // recover any enrollments left 'dispatched' by a prior run

const app = buildHttp({
  enqueue: (job) => dispatcher.enqueue(job),
  genId: () => randomUUID(),
  listLeads: () => leadStore.all().map((l) => toLeadSummary(leadStore.getFull(l.id)!)),
  getLead: (id) => { const f = leadStore.getFull(id); return f ? toLeadDetail(f) : null; },
  leadsCsv: () => leadsToCsv(leadStore.all().map((l) => ({
    fullName: l.fullName, headline: l.headline, location: l.location,
    currentCompany: l.currentCompany, currentTitle: l.currentTitle, profileUrl: l.profileUrl,
  }))),
  getOverview: () => {
    const cfg = loadGovernorConfig(settingStore);
    const since = startOfDay(Date.now());
    const caps = Object.entries(cfg.caps).map(([action, cap]) => ({ action, used: store.countByTypeSince(action, since), cap }));
    const enrollments = enrollmentStore.all();
    const campaigns = campaignStore.allCampaigns();
    return {
      caps,
      counts: {
        leads: leadStore.all().length,
        campaigns: campaigns.length,
        runningCampaigns: campaigns.filter((c) => c.status === 'running').length,
        activeEnrollments: enrollments.filter((e) => e.state === 'active' || e.state === 'dispatched').length,
        doneEnrollments: enrollments.filter((e) => e.state === 'done').length,
      },
      recentActivity: store.recent(15).map((j) => ({ jobId: j.id, type: j.type, target: j.target, status: j.status, at: j.completedAt ?? j.dispatchedAt ?? j.createdAt })),
    };
  },
  listCampaigns: () => campaignStore.allCampaigns().map((c) => toCampaignSummary(c, campaignStore.listNodes(c.id), enrollmentStore.listByCampaign(c.id))),
  getCampaign: (id) => {
    const c = campaignStore.getCampaign(id);
    if (!c) return null;
    const evs = enrollmentStore.listByCampaign(id).map((e) => toEnrollmentView(
      e,
      e.currentNodeId ? (campaignStore.getNode(e.currentNodeId)?.type ?? '-') : '-',
      leadStore.get(e.leadId)?.fullName ?? e.leadId,
    ));
    return toCampaignDetail(c, campaignStore.listNodes(id), campaignStore.listEdges(id), evs);
  },
});

// Serve the built dashboard (if present) as a SPA at '/'. Built later by apps/dashboard.
const dashDist = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dashboard', 'dist');
if (existsSync(dashDist)) {
  await app.register(fastifyStatic, { root: dashDist });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/leads') || req.url.startsWith('/jobs')) return reply.code(404).send({ error: 'not found' });
    return reply.sendFile('index.html');
  });
}

await app.listen({ port: config.port + 1, host: '127.0.0.1' });

const ticker = setInterval(() => {
  try { engine.tick(Date.now()); } catch (err) { console.error('[engine] tick error', err); }
}, 60_000);
void ticker;

console.log(`AURA brain up.
  WS  (hands):  ws://127.0.0.1:${config.port}/ws
  HTTP (api):   http://127.0.0.1:${config.port + 1}
  TOKEN:        ${config.token}
  ENGINE:       ticking every 60s (campaigns + governor active)
Paste the token + WS port into the extension options.`);
