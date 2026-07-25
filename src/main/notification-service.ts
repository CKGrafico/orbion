import { Notification } from "electron";
import type { DeepLinkTarget, NotificationSendArgs } from "../shared/ipc.js";
import { getMainWindow } from "./main-window.js";
import Store from "electron-store";

interface NotificationConfigSchema {
  notificationsMuted: boolean;
  pendingDeepLink: DeepLinkTarget | null;
}

const store = new Store<NotificationConfigSchema>({
  defaults: {
    notificationsMuted: false,
    pendingDeepLink: null,
  },
});

/**
 * Uses Electron's native Notification API which respects OS Do Not Disturb,
 * fires a reliable click event that can focus + navigate the window,
 * and works even when the window is minimized or hidden.
 */
export class NotificationService {
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

  setPendingDeepLink(link: DeepLinkTarget): void {
    store.set("pendingDeepLink", link);
  }

  consumePendingDeepLink(): DeepLinkTarget | null {
    const link = store.get("pendingDeepLink", null);
    if (link) {
      store.delete("pendingDeepLink");
    }
    return link;
  }

  dispatchPendingDeepLink(): void {
    const link = this.consumePendingDeepLink();
    if (!link) return;
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("notification:navigate", link);
    }
  }
}
