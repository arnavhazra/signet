import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getDemoRuntime,
  resetDemoVisitor,
  startDemoSession,
  subscribeDemoRuntime,
  switchDemoRole,
  type DemoRuntime,
} from '@/api/client';
import { DEMO_ROLES, type DemoRole } from '@/auth/demo';
import { clearTourStorage } from '@/lib/tourStorage';

type DemoSessionContextValue = DemoRuntime & {
  roleBusy: boolean;
  resetBusy: boolean;
  resetOpen: boolean;
  switchRole: (role: DemoRole) => Promise<void>;
  openResetConfirm: () => void;
  closeResetConfirm: () => void;
  confirmReset: () => Promise<void>;
  resetImmediate: () => Promise<void>;
};

const DemoSessionContext = createContext<DemoSessionContextValue | null>(null);

export function DemoSessionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [runtime, setRuntime] = useState<DemoRuntime>(() => getDemoRuntime());
  const [roleBusy, setRoleBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    void startDemoSession().catch(() => {
      /* banner via runtime.status */
    });
    return subscribeDemoRuntime(() => setRuntime({ ...getDemoRuntime() }));
  }, []);

  useEffect(() => {
    if (!resetOpen) return;
    confirmRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setResetOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [resetOpen]);

  const switchRole = useCallback(async (role: DemoRole) => {
    setRoleBusy(true);
    try {
      await switchDemoRole(role);
    } finally {
      setRoleBusy(false);
    }
  }, []);

  const runReset = useCallback(
    async (source: 'user' | 'tour') => {
      setResetBusy(true);
      try {
        clearTourStorage();
        await resetDemoVisitor();
        window.dispatchEvent(new CustomEvent('signet:demo-reset', { detail: { source } }));
        if (source === 'user') navigate('/');
      } finally {
        setResetBusy(false);
        setResetOpen(false);
      }
    },
    [navigate],
  );

  const confirmReset = useCallback(async () => {
    await runReset('user');
  }, [runReset]);

  const resetImmediate = useCallback(async () => {
    await runReset('tour');
  }, [runReset]);

  const value = useMemo<DemoSessionContextValue>(
    () => ({
      ...runtime,
      roleBusy,
      resetBusy,
      resetOpen,
      switchRole,
      openResetConfirm: () => setResetOpen(true),
      closeResetConfirm: () => setResetOpen(false),
      confirmReset,
      resetImmediate,
    }),
    [confirmReset, resetBusy, resetImmediate, resetOpen, roleBusy, runtime, switchRole],
  );

  return (
    <DemoSessionContext.Provider value={value}>
      {children}
      {resetOpen ? (
        <div className="confirm-backdrop" onClick={() => setResetOpen(false)}>
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="reset-title">Reset demo?</h2>
            <p>Clears this visitor’s queue and tour. You become operator again.</p>
            <div className="row" style={{ marginTop: 16 }}>
              <button
                ref={confirmRef}
                className="btn btn--gold"
                type="button"
                data-testid="reset-confirm"
                disabled={resetBusy}
                onClick={() => void confirmReset()}
              >
                {resetBusy ? 'Resetting…' : 'Reset'}
              </button>
              <button className="btn" type="button" data-testid="reset-cancel" disabled={resetBusy} onClick={() => setResetOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </DemoSessionContext.Provider>
  );
}

export function useDemoSession(): DemoSessionContextValue {
  const ctx = useContext(DemoSessionContext);
  if (!ctx) throw new Error('useDemoSession requires DemoSessionProvider');
  return ctx;
}

export { DEMO_ROLES };
export type { DemoRole };
