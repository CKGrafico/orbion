import { useState, useCallback, useRef } from "react";

export interface UnreadState {
  lastVisited: Record<string, number>;
}

const STORAGE_KEY = "orbion.unread.v1";

function loadState(): UnreadState {
  if (window.api) return { lastVisited: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as UnreadState;
  } catch { /* empty */ }
  return { lastVisited: {} };
}

function saveState(state: UnreadState): void {
  if (window.api) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* empty */ }
}

export function useUnreadTracker(): {
  isUnread: (itemId: string, completedAt: number | null) => boolean;
  markVisited: (itemId: string) => void;
} {
  const [state, setState] = useState<UnreadState>(loadState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const markVisited = useCallback((itemId: string) => {
    setState((prev) => {
      const next = {
        ...prev,
        lastVisited: { ...prev.lastVisited, [itemId]: Date.now() },
      };
      saveState(next);
      return next;
    });
  }, []);

  const isUnread = useCallback(
    (itemId: string, completedAt: number | null): boolean => {
      if (completedAt === null) return false;
      const visited = stateRef.current.lastVisited[itemId];
      if (visited === undefined) return completedAt > 0;
      return completedAt > visited;
    },
    [],
  );

  return { isUnread, markVisited };
}
