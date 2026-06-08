import type { Job, JobType, Result } from '@aura/contract';
import type { CampaignStore } from '../db/campaign-store.js';
import type { EnrollmentStore } from '../db/enrollment-store.js';
import type { LeadStore } from '../db/lead-store.js';
import type { Dispatcher } from '../dispatcher.js';
import type { EnrollmentRow, NodeRow } from '../db/schema.js';
import type { Governor } from './governor.js';
import { chooseCondition, isActionNode, jobPayload, waitMs } from './payload.js';
import type { RecentPost } from '../ai/personalize.js';
import { tripReason } from './breaker.js';

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
    private onDanger?: (reason: string, now: number) => void,
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
    if (node.type === 'wait' || node.type === 'condition') return this.advance(e, node, now);

    if (!isActionNode(node.type)) return this.enrollments.finish(e.id, 'failed', now);

    const full = this.leads.getFull(e.leadId);
    if (!full) return this.enrollments.finish(e.id, 'failed', now);
    const lead = full.lead;

    const decision = this.governor.canDispatch(node.type, lead.profileUrl, now);
    if (decision.kind === 'skip') return this.advance(e, node, now);
    if (decision.kind === 'defer') return this.enrollments.reschedule(e.id, decision.nextEligibleAt, now);

    const job: Job = { id: this.genId(), type: node.type as JobType, target: lead.profileUrl, payload: jobPayload(node, lead, full.posts as RecentPost[]) };
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

    // Trip the circuit breaker on any danger signal, regardless of whether we find an enrollment.
    const danger = tripReason(result);
    if (danger) this.onDanger?.(danger, now);

    const e = this.enrollments.findByPendingJob(result.jobId);
    if (!e || !e.currentNodeId) return;
    const node = this.campaigns.getNode(e.currentNodeId);
    if (!node) return;

    if (result.status === 'ok') {
      const cs = result.observed?.connectionState;
      if (typeof cs === 'string') this.enrollments.setConnectionState(e.id, cs, now);
      if (result.observed?.replied) this.enrollments.markReplied(e.id, now);
      this.enrollments.clearPending(e.id, now);
      const fresh = this.enrollments.get(e.id) ?? e;
      const freshNode = fresh.currentNodeId ? this.campaigns.getNode(fresh.currentNodeId) : node;
      this.advance(fresh, freshNode ?? node, now);
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

  /** Choose the best-matching outgoing edge from the enrollment's signals and schedule the next node. */
  private advance(e: EnrollmentRow, node: NodeRow, now: number): void {
    const edges = this.campaigns.outgoingEdges(node.id);
    if (edges.length === 0) return this.enrollments.finish(e.id, 'done', now); // terminal node
    const cond = chooseCondition({ connectionState: e.connectionState, repliedAt: e.repliedAt }, edges.map((x) => x.condition));
    const next_edge = edges.find((x) => x.condition === cond) ?? edges.find((x) => x.condition === 'default') ?? edges[0];
    const next = this.campaigns.getNode(next_edge.toNodeId);
    if (!next) return this.enrollments.finish(e.id, 'failed', now);
    if (next.type === 'end') { this.enrollments.moveTo(e.id, next.id, now, now); return this.enrollments.finish(e.id, 'done', now); }
    const nextRunAt = next.type === 'wait' ? now + waitMs(next) : now;
    this.enrollments.moveTo(e.id, next.id, nextRunAt, now);
  }
}
