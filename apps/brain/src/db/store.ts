import { and, eq, gte, ne, count } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Job, Result } from '@aura/contract';
import { jobs, type JobRow } from './schema.js';

export class JobStore {
  constructor(private db: BetterSQLite3Database) {}

  create(job: Job, now: number): void {
    this.db.insert(jobs).values({
      id: job.id, type: job.type, target: job.target,
      payload: JSON.stringify(job.payload ?? {}), status: 'queued', createdAt: now,
    }).run();
  }

  markDispatched(id: string, now: number): void {
    this.db.update(jobs).set({ status: 'dispatched', dispatchedAt: now }).where(eq(jobs.id, id)).run();
  }

  saveResult(result: Result, now: number): void {
    this.db.update(jobs)
      .set({ status: result.status, result: JSON.stringify(result), completedAt: now })
      .where(eq(jobs.id, result.jobId)).run();
  }

  get(id: string): JobRow | undefined {
    return this.db.select().from(jobs).where(eq(jobs.id, id)).get();
  }

  /** Count jobs of a type that were actually sent (status != 'queued') with createdAt >= since. Used for daily caps. */
  countByTypeSince(type: string, since: number): number {
    const row = this.db.select({ n: count() }).from(jobs)
      .where(and(eq(jobs.type, type), gte(jobs.createdAt, since), ne(jobs.status, 'queued'))).get();
    return row?.n ?? 0;
  }

  /** True if a job of (type, target) has an 'ok' result. Used for dedupe ("never act twice on a person"). */
  hasSucceeded(type: string, target: string): boolean {
    return this.db.select({ id: jobs.id }).from(jobs)
      .where(and(eq(jobs.type, type), eq(jobs.target, target), eq(jobs.status, 'ok'))).get() !== undefined;
  }
}
