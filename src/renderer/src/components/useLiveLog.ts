import { useCallback, useEffect, useRef, useState } from "react";
import type { Environment } from "../types";
import { subscribeLogs } from "../api";

export type StreamState = "connected" | "reconnecting" | "stopped";

export interface ReconnectOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30_000;

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
      () => {
        if (!mountedRef.current) return;
        if (stoppedRef.current) return;

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

  useEffect(() => {
    stoppedRef.current = false;
    attemptRef.current = 0;
    subscribe();

    return () => {
      clearTimer();
      doUnsubscribe();
    };
  }, [subscribe, clearTimer, doUnsubscribe]);

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
