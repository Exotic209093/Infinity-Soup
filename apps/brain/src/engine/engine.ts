import type { Job, JobType, Result } from '@aura/contract';
import type { CampaignStore } from '../db/campaign-store.js';
import type { EnrollmentStore } from '../db/enrollment-store.js';
import type { LeadStore } from '../db/lead-store.js';
import type { Dispatcher } from '../dispatcher.js';
import type { EnrollmentRow, NodeRow } from '../db/schema.js';
import type { Governor } from './governor.js';
import { isActionNode, jobPayload, outcomeFor, waitMs } from './payload.js';

type Now = () => number;
const RETRY_BACKOFF_MS = 5 * 60 * 1000;
const DELIVERY_RETRY_MS = 60 * 1000;
const MAX_ATTEMPTS = 3;

export class Engine {
  constructor(
    private campaigns: CampaignStore,
    private enrollments: EnrollmentStore,
    private leads: LeadStore,
    private governor: Governor,
    private dispatcher: Dispatcher,
    private genId: () => string,
    private now: Now = Date.now,
  ) {}

  /** Run all due enrollments once. Called by the 60s ticker and the campaign:tick CLI. */
  tick(now = this.now()): void {
    for (const e of this.enrollments.due(now)) this.run(e, now);
  }

  private run(e: EnrollmentRow, now: number): void {
    if (!e.currentNodeId) return this.enrollments.finish(e.id, 'failed', now);
    const node = this.campaigns.getNode(e.currentNodeId);
    if (!node) return this.enrollments.finish(e.id, 'failed', now);

    if (node.type === 'end') return this.enrollments.finish(e.id, 'done', now);
    if (node.type === 'wait' || node.type === 'condition') return this.advance(e, node, 'default', now);

    if (!isActionNode(node.type)) return this.enrollments.finish(e.id, 'failed', now);

    const lead = this.leads.get(e.leadId);
    if (!lead) return this.enrollments.finish(e.id, 'failed', now);

    const decision = this.governor.canDispatch(node.type, lead.profileUrl, now);
    if (decision.kind === 'skip') return this.advance(e, node, 'default', now);
    if (decision.kind === 'defer') return this.enrollments.reschedule(e.id, decision.nextEligibleAt, now);

    const job: Job = { id: this.genId(), type: node.type as JobType, target: lead.profileUrl, payload: jobPayload(node) };
    const delivered = this.dispatcher.enqueue(job);
    if (delivered) {
      this.enrollments.markDispatched(e.id, job.id, now);
    } else {
      // Hands offline — leave the enrollment 'active' and retry on a later tick when hands reconnect.
      this.enrollments.reschedule(e.id, now + DELIVERY_RETRY_MS, now);
    }
  }

  /** Hands Result for a dispatched enrollment. */
  onResult(result: Result): void {
    const now = this.now();
    const e = this.enrollments.findByPendingJob(result.jobId);
    if (!e || !e.currentNodeId) return;
    const node = this.campaigns.getNode(e.currentNodeId);
    if (!node) return;

    const cs = result.observed?.connectionState;
    if (typeof cs === 'string') this.enrollments.setConnectionState(e.id, cs, now);

    if (result.status === 'ok') {
      this.enrollments.clearPending(e.id, now);
      this.advance(e, node, outcomeFor(node, result), now);
      return;
    }
    const attempts = e.attempts + 1;
    if (attempts < MAX_ATTEMPTS) this.enrollments.retry(e.id, attempts, now + RETRY_BACKOFF_MS, now);
    else this.enrollments.finish(e.id, 'failed', now);
  }

  /**
   * Startup recovery: any enrollment left 'dispatched' has an unrecoverable in-flight Result
   * (the hands socket is gone after a restart). Re-activate it for re-dispatch, bounded by MAX_ATTEMPTS.
   */
  reconcile(now = this.now()): void {
    for (const e of this.enrollments.dispatched()) {
      const attempts = e.attempts + 1;
      if (attempts < MAX_ATTEMPTS) this.enrollments.retry(e.id, attempts, now, now); // re-run same node now
      else this.enrollments.finish(e.id, 'failed', now);
    }
  }

  /** Follow the outgoing edge for `condition` and schedule the next node. */
  private advance(e: EnrollmentRow, node: NodeRow, condition: string, now: number): void {
    const edge = this.campaigns.outgoingEdge(node.id, condition);
    if (!edge) return this.enrollments.finish(e.id, 'done', now); // terminal node with no edge
    const next = this.campaigns.getNode(edge.toNodeId);
    if (!next) return this.enrollments.finish(e.id, 'failed', now);
    if (next.type === 'end') { this.enrollments.moveTo(e.id, next.id, now, now); return this.enrollments.finish(e.id, 'done', now); }
    const nextRunAt = next.type === 'wait' ? now + waitMs(next) : now;
    this.enrollments.moveTo(e.id, next.id, nextRunAt, now);
  }
}
