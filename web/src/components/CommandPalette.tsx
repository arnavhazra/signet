import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { DEMO_ROLES, useDemoSession, type DemoRole } from '@/auth/DemoSession';
import type { InboxItem } from '@/api/types';
import { useFocusTrap } from '@/lib/focusTrap';

type Props = {
  items: InboxItem[];
};

type Command = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  run: () => void;
};

export default function CommandPalette({ items }: Props) {
  const navigate = useNavigate();
  const demo = useDemoSession();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const close = useCallback(() => setOpen(false), []);

  useFocusTrap(open, dialogRef, close);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      setOpen((prev) => !prev);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActive(0);
      return;
    }
    inputRef.current?.focus();
  }, [open]);

  const go = useCallback(
    (path: string) => {
      navigate(path);
      setOpen(false);
    },
    [navigate],
  );

  const switchRole = useCallback(
    (role: DemoRole) => {
      setOpen(false);
      void demo.switchRole(role);
    },
    [demo],
  );

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = [
      { id: 'inbox', group: 'Go', label: 'Inbox', hint: '/', run: () => go('/') },
      { id: 'agent', group: 'Go', label: 'Agent', hint: '/agent', run: () => go('/agent') },
      { id: 'audit', group: 'Go', label: 'Audit', hint: '/audit', run: () => go('/audit') },
      { id: 'admin', group: 'Go', label: 'Admin', hint: '/admin', run: () => go('/admin') },
    ];
    const roles: Command[] = DEMO_ROLES.map((role) => ({
      id: `role-${role}`,
      group: 'Role',
      label: `Switch to ${role}`,
      hint: demo.role === role ? 'current' : undefined,
      run: () => switchRole(role),
    }));
    const demoCmds: Command[] = [
      {
        id: 'reset',
        group: 'Demo',
        label: 'Reset demo',
        run: () => {
          setOpen(false);
          demo.openResetConfirm();
        },
      },
    ];
    const jumps: Command[] = items.map((item) => ({
      id: `jump-${item.sessionId}`,
      group: 'Jump account',
      label: `Jump ${item.accountId}`,
      hint: [item.securityId, item.workflowSlug].filter(Boolean).join(' · '),
      run: () => go(`/sessions/${encodeURIComponent(item.sessionId)}`),
    }));
    return [...nav, ...roles, ...demoCmds, ...jumps];
  }, [demo, go, items, switchRole]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((cmd) =>
      [cmd.label, cmd.hint, cmd.group].filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    setActive(0);
  }, [query, open]);

  useEffect(() => {
    if (active >= filtered.length) setActive(Math.max(0, filtered.length - 1));
  }, [active, filtered.length]);

  function runActive() {
    const cmd = filtered[active];
    if (cmd) cmd.run();
  }

  const groups: { name: string; items: { cmd: Command; index: number }[] }[] = [];
  for (let index = 0; index < filtered.length; index += 1) {
    const cmd = filtered[index];
    const last = groups[groups.length - 1];
    if (!last || last.name !== cmd.group) groups.push({ name: cmd.group, items: [{ cmd, index }] });
    else last.items.push({ cmd, index });
  }

  return (
    <>
      <button className="btn btn--ghost cmdk-launch" type="button" data-testid="cmdk-launch" onClick={() => setOpen(true)}>
        Command
        <span className="kbd">⌘K</span>
      </button>
      {open
        ? createPortal(
            <div className="cmdk-backdrop" data-modal="cmdk" onMouseDown={close}>
              <div
                ref={dialogRef}
                className="cmdk"
                role="dialog"
                aria-modal="true"
                aria-label="Command palette"
                data-testid="command-palette"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <input
                  ref={inputRef}
                  className="cmdk__input"
                  data-testid="command-palette-input"
                  value={query}
                  placeholder="Inbox, role, account…"
                  aria-label="Filter commands"
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      setActive((prev) => Math.min(filtered.length - 1, prev + 1));
                    } else if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      setActive((prev) => Math.max(0, prev - 1));
                    } else if (event.key === 'Enter') {
                      event.preventDefault();
                      runActive();
                    }
                  }}
                />
                {filtered.length === 0 ? (
                  <p className="cmdk__empty">No matching command.</p>
                ) : (
                  <div className="cmdk__list" role="listbox" aria-label="Commands">
                    {groups.map((group) => (
                      <div key={group.name}>
                        <div className="cmdk__group">{group.name}</div>
                        {group.items.map(({ cmd, index }) => (
                          <button
                            key={cmd.id}
                            id={`cmdk-${cmd.id}`}
                            type="button"
                            role="option"
                            aria-selected={index === active}
                            className={`cmdk__item${index === active ? ' is-active' : ''}`}
                            onMouseEnter={() => setActive(index)}
                            onClick={() => cmd.run()}
                          >
                            <span>{cmd.label}</span>
                            {cmd.hint ? <span className="cmdk__hint">{cmd.hint}</span> : null}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
