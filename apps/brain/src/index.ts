import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { WebSocketServer } from 'ws';
import { loadConfig } from './config.js';
import { JobStore } from './db/store.js';
import { HandsServer } from './ws/server.js';
import { Dispatcher } from './dispatcher.js';
import { buildHttp } from './http.js';

const DATA_DIR = '.aura';
const config = loadConfig(DATA_DIR);

const sqlite = new Database(join(DATA_DIR, 'aura.sqlite'));
sqlite.pragma('foreign_keys = ON');
const db = drizzle(sqlite);
migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle') }); // src/ -> apps/brain/drizzle
const store = new JobStore(db);

const wss = new WebSocketServer({ port: config.port, path: '/ws' });
const hands = new HandsServer({ wss, token: config.token, onResult: (r) => {
  dispatcher.handleResult(r);
  console.log('[result]', r.jobId, r.status, JSON.stringify(r.data ?? {}), JSON.stringify(r.observed ?? {}));
}});
const dispatcher = new Dispatcher(store, (job) => hands.sendJob(job));

const app = buildHttp({ enqueue: (job) => dispatcher.enqueue(job), genId: () => randomUUID() });
await app.listen({ port: config.port + 1, host: '127.0.0.1' });

console.log(`AURA brain up.
  WS  (hands):  ws://127.0.0.1:${config.port}/ws
  HTTP (api):   http://127.0.0.1:${config.port + 1}
  TOKEN:        ${config.token}
Paste the token + WS port into the extension options.`);
