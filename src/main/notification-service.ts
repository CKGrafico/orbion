import { Notification } from "electron";
import type { DeepLinkTarget, NotificationSendArgs } from "../shared/ipc.js";
import { getMainWindow } from "./main-window.js";
import Store from "electron-store";

interface NotificationConfigSchema {
  notificationsMuted: boolean;
  pendingDeepLink: DeepLinkTarget | null;
  [key: string]: unknown;
}

const store = new Store<NotificationConfigSchema>({
  defaults: {
    notificationsMuted: false,
    pendingDeepLink: null,
  },
});

/**
 * Main-process notification service.
 *
 * Uses Electron's native Notification API which:
 * - Respects OS Do Not Disturb (macOS / Windows Focus Assist)
 * - Fires a reliable click event that can focus + navigate the window
 * - Works even when the window is minimized or hidden
 */
export class NotificationService {
  /**
   * Show a native OS notification.
   * Respects global mute and OS Do Not Disturb.
   * If the window is focused and suppressIfFocused is true, skips the notification.
   */
  send(args: NotificationSendArgs): void {
    if (this.isMuted()) return;

    if (!Notification.isSupported()) return;

    const win = getMainWindow();
    if (args.suppressIfFocused && win && !win.isDestroyed() && win.isFocused()) return;

    const n = new Notification({
      title: args.title,
      body: args.body,
      silent: false,
    });

    n.on("click", () => {
      if (args.deepLink) {
        if (win && !win.isDestroyed()) {
          if (win.isMinimized()) win.restore();
          win.focus();
          win.webContents.send("notification:navigate", args.deepLink);
        } else {
          this.setPendingDeepLink(args.deepLink);
        }
      }
      n.close();
    });

    n.show();
  }

  isMuted(): boolean {
    return store.get("notificationsMuted", false);
  }

  setMuted(muted: boolean): void {
    store.set("notificationsMuted", muted);
  }

  /**
   * Store a deep-link for cold-start recovery.
   * Called when a notification is clicked but no window exists yet.
   */
  setPendingDeepLink(link: DeepLinkTarget): void {
    store.set("pendingDeepLink", link);
  }

  /**
   * Retrieve and clear the pending deep-link (called once on window creation).
   */
  consumePendingDeepLink(): DeepLinkTarget | null {
    const link = store.get("pendingDeepLink", null);
    if (link) {
      store.delete("pendingDeepLink");
    }
    return link;
  }

  /**
   * Send the pending deep-link to the renderer if one exists.
   * Called after the main window is created and ready.
   */
  dispatchPendingDeepLink(): void {
    const link = this.consumePendingDeepLink();
    if (!link) return;
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("notification:navigate", link);
    }
  }
}
