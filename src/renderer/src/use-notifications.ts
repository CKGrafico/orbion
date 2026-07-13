import type { FleetItemStatus } from "./fleet-status";
import { isNotifiableStatus } from "./fleet-status";

export interface NotificationOptions {
  environmentId: string;
  environmentName: string;
  itemId: string;
  itemType: "thread" | "loop";
  status: FleetItemStatus;
  message: string;
}

export interface NotificationBridge {
  sendNotification: (opts: NotificationOptions) => void;
  setMuted: (environmentId: string, muted: boolean) => void;
  isMuted: (environmentId: string) => boolean;
  onFocusItem?: (environmentId: string, itemId: string, itemType: "thread" | "loop") => void;
}

export function createNotificationBridge(
  onFocusItem?: (environmentId: string, itemId: string, itemType: "thread" | "loop") => void,
): NotificationBridge {
  const muted = new Set<string>();

  return {
    sendNotification(opts: NotificationOptions): void {
      if (muted.has(opts.environmentId)) return;
      if (!isNotifiableStatus(opts.status)) return;
      if (typeof Notification === "undefined") return;

      if (Notification.permission === "granted") {
        fireNotification(opts, onFocusItem);
      } else if (Notification.permission !== "denied") {
        void Notification.requestPermission().then((perm) => {
          if (perm === "granted") fireNotification(opts, onFocusItem);
        });
      }
    },
    setMuted(environmentId: string, m: boolean): void {
      if (m) muted.add(environmentId);
      else muted.delete(environmentId);
    },
    isMuted(environmentId: string): boolean {
      return muted.has(environmentId);
    },
    onFocusItem,
  };
}

function fireNotification(
  opts: NotificationOptions,
  onFocusItem?: (environmentId: string, itemId: string, itemType: "thread" | "loop") => void,
): void {
  const n = new Notification(`[${opts.environmentName}] ${opts.itemType} needs attention`, {
    body: opts.message,
    tag: `${opts.environmentId}:${opts.itemId}`,
  });
  n.onclick = () => {
    window.focus();
    onFocusItem?.(opts.environmentId, opts.itemId, opts.itemType);
    n.close();
  };
}
