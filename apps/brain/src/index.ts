import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { WebSocketServer } from 'ws';
import { loadConfig } from './config.js';
import { JobStore } from './db/store.js';
import { LeadStore } from './db/lead-store.js';
import { HandsServer } from './ws/server.js';
import { Dispatcher } from './dispatcher.js';
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
}});
const dispatcher = new Dispatcher(store, (job) => hands.sendJob(job));

const app = buildHttp({
  enqueue: (job) => dispatcher.enqueue(job),
  genId: () => randomUUID(),
  // TODO: replace stubs once LeadStore gains listSummaries / getDetail / toCsv (Phase 1B)
  listLeads: () => leadStore.all().map((r) => ({
    id: r.id, fullName: r.fullName, currentTitle: r.currentTitle ?? '', currentCompany: r.currentCompany ?? '',
    location: r.location ?? '', expCount: 0, eduCount: 0, skillCount: 0, updatedAt: r.updatedAt,
  })),
  getLead: (id) => {
    const full = leadStore.getFull(id);
    if (!full) return null;
    const r = full.lead;
    return {
      id: r.id, fullName: r.fullName, headline: r.headline ?? '', location: r.location ?? '',
      currentTitle: r.currentTitle ?? '', currentCompany: r.currentCompany ?? '',
      about: r.about ?? '', profileUrl: r.profileUrl, updatedAt: r.updatedAt,
      experience: [], education: [], skills: [],
    };
  },
  leadsCsv: () => {
    const rows = leadStore.all();
    const header = 'id,fullName,currentTitle,currentCompany,location,updatedAt';
    const lines = rows.map((r) => [r.id, r.fullName, r.currentTitle ?? '', r.currentCompany ?? '', r.location ?? '', r.updatedAt ?? ''].join(','));
    return [header, ...lines].join('\n');
  },
});
await app.listen({ port: config.port + 1, host: '127.0.0.1' });

console.log(`AURA brain up.
  WS  (hands):  ws://127.0.0.1:${config.port}/ws
  HTTP (api):   http://127.0.0.1:${config.port + 1}
  TOKEN:        ${config.token}
Paste the token + WS port into the extension options.`);
