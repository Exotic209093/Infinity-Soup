import type { Job, Result } from '@aura/contract';
import type { JobStore } from './db/store.js';

/** sendJob returns true if a hands client received the job. */
export type SendJob = (job: Job) => boolean;
export type Now = () => number;

export class Dispatcher {
  constructor(private store: JobStore, private sendJob: SendJob, private now: Now = Date.now) {}

  enqueue(job: Job): void {
    this.store.create(job, this.now());
    const delivered = this.sendJob(job);
    if (delivered) this.store.markDispatched(job.id, this.now());
  }

  handleResult(result: Result): void {
    this.store.saveResult(result, this.now());
  }
}
