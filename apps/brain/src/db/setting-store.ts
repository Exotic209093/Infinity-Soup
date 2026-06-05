import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { setting } from './schema.js';

export class SettingStore {
  constructor(private db: BetterSQLite3Database) {}

  get(key: string): string | undefined {
    return this.db.select().from(setting).where(eq(setting.key, key)).get()?.value;
  }

  set(key: string, value: string): void {
    this.db.insert(setting).values({ key, value })
      .onConflictDoUpdate({ target: setting.key, set: { value } }).run();
  }
}
