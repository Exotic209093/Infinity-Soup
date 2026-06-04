import { describe, it, expect, afterEach } from 'vitest';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import WebSocket from 'ws';
import { HandsServer } from './server.js';

let srv: HandsServer | undefined;
afterEach(() => srv?.close());

async function startServer(token: string): Promise<number> {
  const wss = new WebSocketServer({ port: 0 });
  await once(wss, 'listening');
  srv = new HandsServer({ wss, token });
  return (srv.address() as any).port;
}

function connect(port: number): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}/ws`);
}

describe('HandsServer auth', () => {
  it('welcomes a client with the correct token', async () => {
    const port = await startServer('secret');
    const ws = connect(port);
    const welcome = await new Promise<string>((resolve) => {
      ws.on('open', () => ws.send(JSON.stringify({ kind: 'hello', token: 'secret' })));
      ws.on('message', (d) => resolve(JSON.parse(d.toString()).kind));
    });
    expect(welcome).toBe('welcome');
    expect(srv!.hasHands()).toBe(true);
    ws.close();
  });

  it('closes a client with the wrong token', async () => {
    const port = await startServer('secret');
    const ws = connect(port);
    const closed = await new Promise<boolean>((resolve) => {
      ws.on('open', () => ws.send(JSON.stringify({ kind: 'hello', token: 'WRONG' })));
      ws.on('close', () => resolve(true));
    });
    expect(closed).toBe(true);
    expect(srv!.hasHands()).toBe(false);
  });
});
