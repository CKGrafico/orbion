import { useCallback, useEffect, useRef } from "react";
import { cid, useInject } from "inversify-hooks";
import type { INotificationService } from "./services/interfaces";
import type { DeepLinkTarget, NotificationSendArgs } from "../../shared/ipc";
import i18n from "./i18n";
import type { FleetItemStatus } from "./fleet-status";
import { isNotifiableStatus } from "./fleet-status";

export function useNativeNotifications(onNavigate?: (deepLink: DeepLinkTarget) => void): {
  notificationService: INotificationService;
  sendInboxNotification: (opts: {
    environmentId: string;
    environmentName: string;
    itemId: string;
    itemType: "thread" | "loop";
    status: FleetItemStatus;
    message: string;
  }) => Promise<void>;
} {
  const [notificationService] = useInject<INotificationService>(cid.INotificationService);
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

  useEffect(() => {
    const unsub = notificationService.onClick((deepLink) => {
      onNavigateRef.current?.(deepLink);
    });
    return unsub;
  }, [notificationService]);

  const sendInboxNotification = useCallback(
    async (opts: {
      environmentId: string;
      environmentName: string;
      itemId: string;
      itemType: "thread" | "loop";
      status: FleetItemStatus;
      message: string;
    }): Promise<void> => {
      if (!isNotifiableStatus(opts.status)) return;

      const deepLink: DeepLinkTarget =
        opts.itemType === "loop"
          ? { kind: "loop", environmentId: opts.environmentId, loopId: opts.itemId }
          : { kind: "instance", environmentId: opts.environmentId };

      const args: NotificationSendArgs = {
        title: i18n.t(
          "app.notificationItemNeedsAttention",
          { envName: opts.environmentName, itemType: opts.itemType },
        ),
        body: opts.message,
        tag: `${opts.environmentId}:${opts.itemId}`,
        deepLink,
        suppressIfFocused: true,
      };

      await notificationService.send(args);
    },
    [notificationService],
  );

  return { notificationService, sendInboxNotification };
}
