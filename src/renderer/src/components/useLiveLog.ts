import { useCallback, useEffect, useRef, useState } from "react";
import type { Environment } from "../types";
import { subscribeLogs } from "../api";

/**
 * Stream connection state reported by useLiveLog.
 * - "connected"    — active SSE subscription, receiving data
 * - "reconnecting" — stream ended or errored; automatic reconnect pending
 * - "stopped"      — max retries exhausted or explicitly stopped
 */
export type StreamState = "connected" | "reconnecting" | "stopped";

/** Configuration for reconnect behavior. */
export interface ReconnectOptions {
  /** Maximum number of reconnect attempts (default 5). */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default 1000). */
  baseDelayMs?: number;
  /** Maximum delay cap in ms (default 30000). */
  maxDelayMs?: number;
}

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30_000;

/**
 * Hook that manages SSE log subscription with automatic reconnect.
 *
 * On stream `end` or `error`, the hook schedules a reconnect with
 * exponential backoff (capped at `maxDelayMs`). Unmounting, a change
 * in the environment/loopId, or an explicit `stop()` call cancels
 * any pending reconnect timer and unsubscribes.
 *
 * Guarantees:
 * - At most one active subscription at any time (no duplicates).
 * - No duplicate log rows: the `onLine` callback is only wired to
 *   the currently active subscription.
 * - Unmount during backoff cancels the timer (no dangling timeouts).
 */
export function useLiveLog(
  env: Environment,
  loopId: string,
  onLine: (line: string) => void,
  onEvent: (parsed: unknown) => void,
  options?: ReconnectOptions,
): {
  streamState: StreamState;
  reconnect: () => void;
  stop: () => void;
} {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

  const [streamState, setStreamState] = useState<StreamState>("connected");

  // Refs to always have the latest callbacks without re-subscribing
  const onLineRef = useRef(onLine);
  onLineRef.current = onLine;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const stoppedRef = useRef(false);
  const mountedRef = useRef(true);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const doUnsubscribe = useCallback(() => {
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
  }, []);

  const subscribe = useCallback(() => {
    doUnsubscribe();
    clearTimer();

    if (stoppedRef.current || !mountedRef.current) return;

    const unsub = subscribeLogs(
      env,
      loopId,
      (line) => {
        if (!mountedRef.current) return;
        onLineRef.current(line);
      },
      // onClose — called when stream ends (clean EOF or error)
      () => {
        if (!mountedRef.current) return;

        if (stoppedRef.current) return;

        // Schedule reconnect with exponential backoff
        const attempt = attemptRef.current;
        if (attempt >= maxRetries) {
          setStreamState("stopped");
          return;
        }

        setStreamState("reconnecting");

        const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
        const jitter = delay * (0.5 + Math.random() * 0.5);

        attemptRef.current = attempt + 1;
        timerRef.current = setTimeout(() => {
          if (!mountedRef.current || stoppedRef.current) return;
          subscribe();
        }, jitter);
      },
      (parsed) => {
        if (!mountedRef.current) return;
        onEventRef.current(parsed);
      },
    );

    unsubRef.current = unsub;
    attemptRef.current = 0;
    if (!stoppedRef.current) {
      setStreamState("connected");
    }
  }, [env.id, env.activeEndpointId, loopId, maxRetries, baseDelayMs, maxDelayMs, doUnsubscribe, clearTimer]);

  // (Re)subscribe when env/loopId changes
  useEffect(() => {
    stoppedRef.current = false;
    attemptRef.current = 0;
    subscribe();

    return () => {
      clearTimer();
      doUnsubscribe();
    };
  }, [subscribe, clearTimer, doUnsubscribe]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
      doUnsubscribe();
    };
  }, [clearTimer, doUnsubscribe]);

  const reconnect = useCallback(() => {
    stoppedRef.current = false;
    attemptRef.current = 0;
    subscribe();
  }, [subscribe]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    clearTimer();
    doUnsubscribe();
    setStreamState("stopped");
  }, [clearTimer, doUnsubscribe]);

  return { streamState, reconnect, stop };
}
