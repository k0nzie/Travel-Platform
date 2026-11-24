'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './button';
import { AlertIcon, CheckCircleIcon, InfoIcon, XIcon } from './icons';

/* ======================= Dialog ======================= */

/**
 * A modal built on the native <dialog>: focus is trapped, Escape closes it, the page behind is inert.
 *   <Dialog open={open} onClose={() => setOpen(false)} title="Edit room">…</Dialog>
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the backdrop (the dialog element itself) closes it.
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="dialog-title"
      className={cn(
        'm-auto w-[calc(100%-2rem)] rounded-card border border-line bg-surface p-0 text-ink shadow-float open:animate-fade-in',
        size === 'sm' && 'max-w-sm',
        size === 'md' && 'max-w-lg',
        size === 'lg' && 'max-w-2xl',
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
            <div>
              <h2 id="dialog-title" className="text-lg font-semibold">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 rounded-control p-1.5 text-ink-soft hover:bg-sunken hover:text-ink"
            >
              <XIcon className="size-5" />
            </button>
          </header>
          {children && <div className="overflow-y-auto px-6 pb-5">{children}</div>}
          {footer && <footer className="flex justify-end gap-2 border-t border-line px-6 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

/* ======================= Confirm (GEN-03) ======================= */

export interface ConfirmOptions {
  title: ReactNode;
  description?: ReactNode;
  /** The button names the action: "Delete post", "Cancel booking" — never just "OK". */
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Ask before any destructive action:
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: 'Delete this post?', confirmLabel: 'Delete post', tone: 'danger' }))) return;
 */
export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return confirm;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) => new Promise<boolean>((resolve) => setRequest({ ...options, resolve })),
    [],
  );

  const settle = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={!!request}
        onClose={() => settle(false)}
        title={request?.title}
        description={request?.description}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => settle(false)}>
              {request?.cancelLabel ?? 'Keep it'}
            </Button>
            <Button variant={request?.tone === 'primary' ? 'primary' : 'danger'} onClick={() => settle(true)} autoFocus>
              {request?.confirmLabel}
            </Button>
          </>
        }
      />
    </ConfirmContext.Provider>
  );
}

/* ======================= Toasts ======================= */

type ToastTone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  tone: ToastTone;
  message: ReactNode;
}

interface ToastApi {
  success: (message: ReactNode) => void;
  error: (message: ReactNode) => void;
  info: (message: ReactNode) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Short confirmations after an action, named like the action: "Post published", "Booking cancelled".
 *   const toast = useToast(); toast.success('Profile saved');
 * Use an <Alert> instead for anything the user must read or act on.
 */
export function useToast(): ToastApi {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error('useToast must be used inside <ToastProvider>');
  return toast;
}

let nextToastId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (tone: ToastTone, message: ReactNode) => {
      const id = nextToastId++;
      setToasts((all) => [...all.slice(-3), { id, tone, message }]);
      setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4500);
    },
    [dismiss],
  );

  const [api] = useState<ToastApi>(() => ({
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  }));

  const icons: Record<ToastTone, ReactNode> = {
    success: <CheckCircleIcon className="size-5 text-success" />,
    error: <AlertIcon className="size-5 text-danger" />,
    info: <InfoIcon className="size-5 text-info" />,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:left-auto sm:w-96"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full animate-toast-in items-start gap-3 rounded-card border border-line bg-surface px-4 py-3 text-sm text-ink shadow-float"
          >
            <span className="mt-px shrink-0">{icons[t.tone]}</span>
            <div className="min-w-0 flex-1">{t.message}</div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="-mr-1 shrink-0 rounded p-0.5 text-ink-faint hover:text-ink"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ======================= Menu ======================= */

/** A small dropdown (user menu, row actions). Closes on outside click and Escape. */
export function Menu({
  trigger,
  label,
  children,
  align = 'end',
}: {
  trigger: ReactNode;
  label: string;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-control p-1 transition-colors hover:bg-white/10"
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute top-full z-40 mt-2 min-w-56 animate-fade-in rounded-card border border-line bg-surface py-1.5 text-ink shadow-float',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  children,
  onSelect,
  icon,
  tone = 'default',
}: {
  children: ReactNode;
  onSelect: () => void;
  icon?: ReactNode;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-sunken',
        tone === 'danger' ? 'text-danger' : 'text-ink',
      )}
    >
      {icon && <span className="text-ink-soft">{icon}</span>}
      {children}
    </button>
  );
}
