import { writeFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { join } from 'node:path';
import { lead } from './db/schema.js';
import { leadsToCsv } from './csv.js';

const DATA_DIR = '.aura';
const sqlite = new Database(join(DATA_DIR, 'aura.sqlite'), { readonly: true });
const db = drizzle(sqlite);
const rows = db.select().from(lead).all();
const out = process.argv[2] ?? 'leads.csv';
writeFileSync(out, leadsToCsv(rows));
console.log(`Wrote ${rows.length} leads to ${out}`);
