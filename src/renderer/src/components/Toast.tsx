import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';

// ── Public types ────────────────────────────────────────────────────

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  message: string;
  action?: ToastAction;
  duration?: number; // default 5000
  /** Called when the toast is dismissed (timer expired, or replaced by new toast) */
  onDismissed?: () => void;
}

// ── Internal state shape ────────────────────────────────────────────

interface ActiveToast {
  message: string;
  action: ToastAction | undefined;
  duration: number;
  onDismissed: (() => void) | undefined;
}

// ── Context ─────────────────────────────────────────────────────────

interface ToastContextValue {
  showToast: (opts: ToastOptions) => void;
  activeToast: ActiveToast | null;
  /** Dismiss due to timer expiry or replacement — calls onDismissed */
  dismissWithCallback: () => void;
  /** Dismiss because the user chose the action — does NOT call onDismissed */
  dismissForAction: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 5000;

// ── Provider ────────────────────────────────────────────────────────

function ToastProvider({ children }: { children: ReactNode }) {
  const [activeToast, setActiveToast] = useState<ActiveToast | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDismissedRef = useRef<(() => void) | undefined>(undefined);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      globalThis.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** Dismiss due to timeout or replacement — fires onDismissed */
  const dismissWithCallback = useCallback(() => {
    clearTimer();
    const dismissed = onDismissedRef.current;
    onDismissedRef.current = undefined;
    setActiveToast(null);
    dismissed?.();
  }, [clearTimer]);

  /** Dismiss because user clicked the action — does NOT fire onDismissed */
  const dismissForAction = useCallback(() => {
    clearTimer();
    onDismissedRef.current = undefined;
    setActiveToast(null);
  }, [clearTimer]);

  const showToast = useCallback(
    (opts: ToastOptions) => {
      // If a toast is already showing, fire its onDismissed — it is being replaced
      onDismissedRef.current?.();

      clearTimer();

      const duration = opts.duration ?? DEFAULT_DURATION;
      const toast: ActiveToast = {
        message: opts.message,
        action: opts.action
          ? { label: opts.action.label, onClick: opts.action.onClick }
          : undefined,
        duration,
        onDismissed: opts.onDismissed,
      };

      onDismissedRef.current = opts.onDismissed;
      setActiveToast(toast);

      // Auto-dismiss after duration — fires onDismissed
      timerRef.current = globalThis.setTimeout(() => {
        timerRef.current = null;
        const dismissed = onDismissedRef.current;
        onDismissedRef.current = undefined;
        setActiveToast(null);
        dismissed?.();
      }, duration);
    },
    [clearTimer],
  );

  return (
    <ToastContext.Provider
      value={{ showToast, activeToast, dismissWithCallback, dismissForAction }}
    >
      {children}
    </ToastContext.Provider>
  );
}

// ── Hook ────────────────────────────────────────────────────────────

function useToast(): { showToast: (opts: ToastOptions) => void } {
  const ctx = useContext(ToastContext);
  if (ctx === null) {
    throw new Error('useToast must be used within a <ToastProvider>');
  }
  return { showToast: ctx.showToast };
}

// ── Component ───────────────────────────────────────────────────────

function Toast() {
  const ctx = useContext(ToastContext);
  if (ctx === null) {
    throw new Error('Toast must be used within a <ToastProvider>');
  }

  const { activeToast, dismissForAction } = ctx;

  if (activeToast === null) {
    return null;
  }

  const handleActionClick = () => {
    // User chose an action — dismiss without calling onDismissed, then run action
    const actionOnClick = activeToast.action!.onClick;
    dismissForAction();
    actionOnClick();
  };

  return (
    <div className="toast-container">
      <div className="toast">
        <span className="toast-message">{activeToast.message}</span>
        {activeToast.action && (
          <button className="toast-action" onClick={handleActionClick}>
            {activeToast.action.label}
          </button>
        )}
      </div>
    </div>
  );
}

export { ToastProvider, Toast, useToast };
export type { ToastOptions };
