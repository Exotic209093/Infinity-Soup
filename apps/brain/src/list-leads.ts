import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { join } from 'node:path';
import { lead, leadExperience, leadEducation, leadSkill } from './db/schema.js';

// Pretty-print the scraped leads (a friendly live view for demos).
//   pnpm --filter @aura/brain leads
const DATA_DIR = '.aura';
const sqlite = new Database(join(DATA_DIR, 'aura.sqlite'), { readonly: true });
const db = drizzle(sqlite);

const leads = db.select().from(lead).all();
console.log(`\n${leads.length} lead${leads.length === 1 ? '' : 's'} in the database:\n`);
for (const l of leads) {
  const exp = db.select().from(leadExperience).where(eq(leadExperience.leadId, l.id)).all();
  const edu = db.select().from(leadEducation).where(eq(leadEducation.leadId, l.id)).all();
  const sk = db.select().from(leadSkill).where(eq(leadSkill.leadId, l.id)).all();
  console.log(`● ${l.fullName} — ${l.currentTitle || '?'} @ ${l.currentCompany || '?'}`);
  if (l.location) console.log(`  ${l.location}`);
  console.log(`  ${exp.length} experience · ${edu.length} education · ${sk.length} skills`);
  for (const e of exp) {
    const dates = [e.startDate, e.endDate].filter(Boolean).join('–');
    console.log(`    · ${e.title}${e.company ? ` @ ${e.company}` : ''}${dates ? ` (${dates})` : ''}`);
  }
  for (const e of edu) {
    const yrs = [e.startYear, e.endYear].filter(Boolean).join('–');
    console.log(`    🎓 ${e.school}${yrs ? ` (${yrs})` : ''}`);
  }
  if (sk.length) console.log(`    🛠  ${sk.map((s) => s.name).join(', ')}`);
  console.log('');
}
sqlite.close();
