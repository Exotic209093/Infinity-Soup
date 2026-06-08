import type { JobType } from '@aura/contract';
import type { LeadRow, NodeRow } from '../db/schema.js';
import { templateVars, fillTemplate, type RecentPost } from '../ai/personalize.js';

const ACTION_TYPES = new Set<JobType>(['visit', 'connect', 'message', 'follow', 'endorse']);
export const isActionNode = (type: string): type is JobType => ACTION_TYPES.has(type as JobType);

export function waitMs(node: NodeRow): number {
  const v = (node.config as Record<string, unknown>)?.waitMs;
  return typeof v === 'number' && v >= 0 ? v : 0;
}

/** Build a Job payload from an action node's config, filling template placeholders from the lead. */
export function jobPayload(node: NodeRow, lead: LeadRow, posts: RecentPost[] = []): Record<string, unknown> {
  const c = (node.config ?? {}) as Record<string, unknown>;
  const vars = templateVars(lead, posts);
  if (node.type === 'connect') {
    const note = fillTemplate(String(c.note ?? ''), vars);
    return note ? { note } : {};
  }
  if (node.type === 'message') {
    const text = fillTemplate(String(c.text ?? ''), vars);
    return text ? { text } : {};
  }
  return {};
}

export interface BranchSignals { connectionState: string; repliedAt: number | null; }

/**
 * Pick the outgoing-edge condition that best matches the enrollment's signals,
 * among the conditions actually present on the node's outgoing edges.
 * Priority: replied > accepted > timeout > default. Always resolvable (callers fall back to 'default').
 */
export function chooseCondition(signals: BranchSignals, available: string[]): string {
  const has = (c: string) => available.includes(c);
  if (signals.repliedAt != null && has('replied')) return 'replied';
  if (signals.connectionState === 'connected' && has('accepted')) return 'accepted';
  // No positive signal yet: if the node offers a 'timeout' fork (and isn't relying on 'default'), take it.
  if (has('timeout') && !has('default')) return 'timeout';
  return 'default';
}
