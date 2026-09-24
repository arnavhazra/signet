import type { DemoPlan } from '@/api/types';

const PENDING_PLAN_KEY = 'signet.pendingPlan';

export const DEMO_PLANS: { id: DemoPlan; name: string; blurb: string; price: string }[] = [
  {
    id: 'operator',
    name: 'Operator',
    blurb: 'Single desk. Inbox, maker halt, audited write.',
    price: '$0 simulated',
  },
  {
    id: 'desk',
    name: 'Desk',
    blurb: 'Maker-checker roles and agent propose on one org.',
    price: '$0 simulated',
  },
  {
    id: 'platform',
    name: 'Platform',
    blurb: 'Admin catalog, shared publish stamp, full audit trail.',
    price: '$0 simulated',
  },
];

export function isDemoPlan(value: string): value is DemoPlan {
  return value === 'operator' || value === 'desk' || value === 'platform';
}

export function readPendingPlan(): DemoPlan | null {
  try {
    const raw = localStorage.getItem(PENDING_PLAN_KEY);
    if (raw && isDemoPlan(raw)) return raw;
  } catch {
    /* private mode */
  }
  return null;
}

export function writePendingPlan(plan: DemoPlan): void {
  try {
    localStorage.setItem(PENDING_PLAN_KEY, plan);
  } catch {
    /* private mode */
  }
}

export function clearPendingPlan(): void {
  try {
    localStorage.removeItem(PENDING_PLAN_KEY);
  } catch {
    /* private mode */
  }
}

export function planLabel(plan: DemoPlan | string | null | undefined): string {
  if (plan === 'operator') return 'Operator';
  if (plan === 'desk') return 'Desk';
  if (plan === 'platform') return 'Platform';
  return plan?.trim() ? String(plan) : '—';
}
