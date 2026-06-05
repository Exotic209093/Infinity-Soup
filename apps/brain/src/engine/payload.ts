import type { JobType, Result } from '@aura/contract';
import type { NodeRow } from '../db/schema.js';

const ACTION_TYPES = new Set<JobType>(['visit', 'connect', 'message', 'follow', 'endorse']);
export const isActionNode = (type: string): type is JobType => ACTION_TYPES.has(type as JobType);

export function waitMs(node: NodeRow): number {
  const v = (node.config as Record<string, unknown>)?.waitMs;
  return typeof v === 'number' && v >= 0 ? v : 0;
}

/** Build a Job payload from an action node's config. AI rendering is M3 — static config for now. */
export function jobPayload(node: NodeRow): Record<string, unknown> {
  const c = (node.config ?? {}) as Record<string, unknown>;
  if (node.type === 'connect') return c.note ? { note: c.note } : {};
  if (node.type === 'message') return c.text ? { text: c.text } : {};
  return {};
}

/** Which outgoing-edge condition to follow given a Result. MVP: always 'default' (branching is M3). */
export function outcomeFor(_node: NodeRow, _result: Result): string {
  return 'default';
}
