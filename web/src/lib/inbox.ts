import type { InboxItem } from '@/api/types';
import { inboxStatus } from '@/lib/presentation';

const TOUR_DELTA = 100;

export function isTourRow(item: InboxItem): boolean {
  const status = inboxStatus(item.status, item.awaitingChecker);
  const slug = (item.workflowSlug || '').trim().toLowerCase();
  const delta = Number(item.delta);
  return slug === 'exception-review' && status === 'open' && Number.isFinite(delta) && Math.abs(delta) >= TOUR_DELTA;
}

/** Open exception-review row with |delta| >= 100. Prefers A-214. */
export function pickTourRow(items: InboxItem[]): string | null {
  const matches = items.filter(isTourRow);
  if (matches.length === 0) return null;
  const preferred = matches.find((item) => item.accountId === 'A-214');
  return (preferred ?? matches[0]).sessionId;
}
