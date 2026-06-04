import type { WebSocketServer, WebSocket } from 'ws';
import { ClientFrameSchema, type Result } from '@aura/contract';

export interface HandsServerOpts {
  wss: WebSocketServer;
  token: string;
  onResult?: (result: Result) => void;
}

export class HandsServer {
  private hands: WebSocket | null = null;
  constructor(private opts: HandsServerOpts) {
    opts.wss.on('connection', (ws) => this.onConnection(ws));
  }

  private onConnection(ws: WebSocket) {
    if (this.hands !== null) { ws.close(1008, 'already connected'); return; }
    let authed = false;
    ws.on('message', (raw) => {
      let json: unknown;
      try { json = JSON.parse(raw.toString()); } catch { return; }
      const parsed = ClientFrameSchema.safeParse(json);
      if (!parsed.success) return;
      const frame = parsed.data;
      if (!authed) {
        if (frame.kind === 'hello' && frame.token === this.opts.token) {
          authed = true; this.hands = ws;
          ws.send(JSON.stringify({ kind: 'welcome' }));
        } else { ws.close(); }
        return;
      }
      if (frame.kind === 'result') this.opts.onResult?.(frame.result);
    });
    ws.on('close', () => { if (this.hands === ws) this.hands = null; });
  }

  hasHands(): boolean { return this.hands !== null; }

  sendJob(job: unknown): boolean {
    if (!this.hands) return false;
    this.hands.send(JSON.stringify({ kind: 'job', job }));
    return true;
  }

  address() { return this.opts.wss.address(); }
  close() { this.opts.wss.close(); }
}
