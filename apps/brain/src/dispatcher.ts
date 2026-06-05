import type { Job, Result } from '@aura/contract';
import type { JobStore } from './db/store.js';

/** sendJob returns true if a hands client received the job. */
export type SendJob = (job: Job) => boolean;
export type Now = () => number;

export class Dispatcher {
  constructor(private store: JobStore, private sendJob: SendJob, private now: Now = Date.now) {}

  /** Persist + try to deliver the job to hands. Returns true iff a hands client received it. */
  enqueue(job: Job): boolean {
    const now = this.now();
    this.store.create(job, now);
    const delivered = this.sendJob(job);
    if (delivered) this.store.markDispatched(job.id, now);
    return delivered;
  }

  handleResult(result: Result): void {
    this.store.saveResult(result, this.now());
  }
}
