import { randomUUID } from 'node:crypto';
import { and, eq, isNotNull, lte } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { enrollment, campaign, type EnrollmentRow } from './schema.js';

export class EnrollmentStore {
  constructor(private db: BetterSQLite3Database) {}

  enroll(campaignId: string, leadId: string, startNodeId: string, now: number): string {
    const id = randomUUID();
    this.db.insert(enrollment).values({
      id, campaignId, leadId, currentNodeId: startNodeId, state: 'active', connectionState: 'none',
      nextRunAt: now, pendingJobId: null, attempts: 0, repliedAt: null, createdAt: now, updatedAt: now,
    }).run();
    return id;
  }

  get(id: string): EnrollmentRow | undefined {
    return this.db.select().from(enrollment).where(eq(enrollment.id, id)).get();
  }

  /** Active, due (nextRunAt <= now) enrollments whose campaign is running. */
  due(now: number): EnrollmentRow[] {
    return this.db.select({ e: enrollment }).from(enrollment)
      .innerJoin(campaign, eq(enrollment.campaignId, campaign.id))
      .where(and(
        eq(enrollment.state, 'active'),
        eq(campaign.status, 'running'),
        isNotNull(enrollment.nextRunAt),
        lte(enrollment.nextRunAt, now),
      )).all().map((r) => r.e);
  }

  findByPendingJob(jobId: string): EnrollmentRow | undefined {
    return this.db.select().from(enrollment).where(eq(enrollment.pendingJobId, jobId)).get();
  }

  markDispatched(id: string, jobId: string, now: number): void {
    this.set(id, { state: 'dispatched', pendingJobId: jobId, nextRunAt: null }, now);
  }

  clearPending(id: string, now: number): void {
    this.set(id, { pendingJobId: null }, now);
  }

  /** Advance to a node, active + scheduled. Clears any pending job + resets attempts. */
  moveTo(id: string, nodeId: string, nextRunAt: number, now: number): void {
    this.set(id, { state: 'active', currentNodeId: nodeId, nextRunAt, pendingJobId: null, attempts: 0 }, now);
  }

  /** Keep the same node, just push nextRunAt out (governor defer). Stays active. */
  reschedule(id: string, nextRunAt: number, now: number): void {
    this.set(id, { state: 'active', nextRunAt }, now);
  }

  /** Retry same node after a failure: bump attempts, reschedule, clear pending. */
  retry(id: string, attempts: number, nextRunAt: number, now: number): void {
    this.set(id, { state: 'active', attempts, nextRunAt, pendingJobId: null }, now);
  }

  setConnectionState(id: string, connectionState: string, now: number): void {
    this.set(id, { connectionState }, now);
  }

  markReplied(id: string, now: number): void {
    this.set(id, { repliedAt: now }, now);
  }

  finish(id: string, state: 'done' | 'failed', now: number): void {
    this.set(id, { state, nextRunAt: null, pendingJobId: null }, now);
  }

  private set(id: string, patch: Partial<EnrollmentRow>, now: number): void {
    this.db.update(enrollment).set({ ...patch, updatedAt: now }).where(eq(enrollment.id, id)).run();
  }
}
