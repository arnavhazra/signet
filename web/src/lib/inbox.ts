import type { InboxItem } from '@/api/types';
import { inboxStatus } from '@/lib/presentation';

const TOUR_DELTA = 100;

export type InboxChip = 'all' | 'exception-review' | 'nav-signoff' | 'open' | 'awaiting_checker' | 'done';

export const INBOX_CHIPS: { id: InboxChip; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'exception-review', label: 'exception-review' },
  { id: 'nav-signoff', label: 'nav-signoff' },
  { id: 'open', label: 'open' },
  { id: 'awaiting_checker', label: 'awaiting_checker' },
  { id: 'done', label: 'done' },
];

type InboxListener = () => void;

let cachedInbox: InboxItem[] = [];
const inboxListeners = new Set<InboxListener>();

export function rememberInbox(items: InboxItem[]): void {
  cachedInbox = items;
  inboxListeners.forEach((listener) => listener());
}

export function readInboxCache(): InboxItem[] {
  return cachedInbox;
}

export function subscribeInboxCache(listener: InboxListener): () => void {
  inboxListeners.add(listener);
  return () => {
    inboxListeners.delete(listener);
  };
}

export function inboxWorkflowSlug(sessionId: string): string {
  return cachedInbox.find((item) => item.sessionId === sessionId)?.workflowSlug ?? '';
}

export function filterInbox(items: InboxItem[], chip: InboxChip): InboxItem[] {
  if (chip === 'all') return items;
  if (chip === 'exception-review' || chip === 'nav-signoff') {
    return items.filter((item) => (item.workflowSlug || '').toLowerCase() === chip);
  }
  return items.filter((item) => inboxStatus(item.status, item.awaitingChecker) === chip);
}

export function inboxCounts(items: InboxItem[]): { open: number; awaiting: number } {
  let open = 0;
  let awaiting = 0;
  for (const item of items) {
    const status = inboxStatus(item.status, item.awaitingChecker);
    if (status === 'awaiting_checker') awaiting += 1;
    else if (status === 'open') open += 1;
  }
  return { open, awaiting };
}

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
