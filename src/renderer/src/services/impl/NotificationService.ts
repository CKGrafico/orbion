import { injectable } from "inversify-hooks";
import type { INotificationService } from "../interfaces";

@injectable()
export class NotificationService implements INotificationService {
  private muted = new Set<string>();

  sendNotification(opts: {
    environmentId: string;
    environmentName: string;
    itemId: string;
    itemType: string;
    status: string;
    message: string;
  }): void {
    if (this.muted.has(opts.environmentId)) return;
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(opts.environmentName, { body: opts.message });
    }
  }

  setMuted(environmentId: string, muted: boolean): void {
    if (muted) this.muted.add(environmentId);
    else this.muted.delete(environmentId);
  }
}
