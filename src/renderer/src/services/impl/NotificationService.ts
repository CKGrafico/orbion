import { injectable } from "inversify-hooks";
import type { INotificationService } from "../interfaces";
import type { DeepLinkTarget, NotificationSendArgs } from "../../../../shared/ipc";

// Delegates to the main process via IPC. Uses Electron's native Notification API
// which respects OS DnD, fires reliable click events, and works when minimized.
@injectable()
export class NotificationService implements INotificationService {
  private clickListeners: ((deepLink: DeepLinkTarget) => void)[] = [];

  async send(args: NotificationSendArgs): Promise<void> {
    if (typeof window === "undefined" || !window.api) return;
    await window.api.notification.send(args);
  }

  async setMuted(muted: boolean): Promise<void> {
    if (typeof window === "undefined" || !window.api) return;
    await window.api.notification.setMuted(muted);
  }

  async isMuted(): Promise<boolean> {
    if (typeof window === "undefined" || !window.api) return false;
    return window.api.notification.isMuted();
  }

  onClick(cb: (deepLink: DeepLinkTarget) => void): () => void {
    this.clickListeners.push(cb);

    if (this.clickListeners.length === 1 && typeof window !== "undefined" && window.api) {
      this.unsub = window.api.notification.onClick((deepLink: DeepLinkTarget) => {
        for (const listener of this.clickListeners) {
          listener(deepLink);
        }
      });
    }

    return () => {
      this.clickListeners = this.clickListeners.filter((l) => l !== cb);
      if (this.clickListeners.length === 0 && this.unsub) {
        this.unsub();
        this.unsub = null;
      }
    };
  }

  private unsub: (() => void) | null = null;
}
