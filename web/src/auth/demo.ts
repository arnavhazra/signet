export const DEMO_ROLES = ['operator', 'checker', 'auditor', 'admin'] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];

export function isDemoRole(value: string): value is DemoRole {
  return (DEMO_ROLES as readonly string[]).includes(value);
}
