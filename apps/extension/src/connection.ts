import { ServerFrameSchema, type Job, type Result } from '@aura/contract';

export interface HandsConnectionDeps {
  token: string;
  send: (data: string) => void;
  execute: (job: Job) => Promise<Result>;
}

export class HandsConnection {
  constructor(private deps: HandsConnectionDeps) {}

  onOpen(): void {
    this.deps.send(JSON.stringify({ kind: 'hello', token: this.deps.token }));
  }

  async onMessage(raw: string): Promise<void> {
    let json: unknown;
    try { json = JSON.parse(raw); } catch { return; }
    const parsed = ServerFrameSchema.safeParse(json);
    if (!parsed.success) return;
    const frame = parsed.data;
    if (frame.kind === 'job') {
      const result = await this.deps.execute(frame.job);
      this.deps.send(JSON.stringify({ kind: 'result', result }));
    }
  }
}
