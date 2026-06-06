/** Compact relative time, e.g. "just now", "5m ago", "3h ago", "2d ago", or a date. */
export function relativeTime(ts: number | null): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 0) {
    // Future timestamp (e.g. nextRunAt scheduled ahead).
    const ahead = -diff;
    if (ahead < 60_000) return 'in <1m';
    if (ahead < 3_600_000) return `in ${Math.round(ahead / 60_000)}m`;
    if (ahead < 86_400_000) return `in ${Math.round(ahead / 3_600_000)}h`;
    return `in ${Math.round(ahead / 86_400_000)}d`;
  }
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ts).toLocaleDateString();
}
