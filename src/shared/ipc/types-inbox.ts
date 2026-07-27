import type { PrVerdict } from "./types-infra.js";

export type InboxItemKind =
  | "breach"
  | "failed-loop"
  | "finished-loop"
  | "pending-approval"
  | "awaiting-input"
  | "instance-offline"
  | "prolonged-offline"
  | "pr-awaiting-review"
  | "digest";

export type NotificationType = "failure" | "finished" | "watch" | "digest";

export function kindToNotificationType(kind: InboxItemKind): NotificationType {
  switch (kind) {
    case "failed-loop":
    case "instance-offline":
    case "prolonged-offline":
      return "failure";
    case "finished-loop":
      return "finished";
    case "breach":
    case "pending-approval":
    case "awaiting-input":
    case "pr-awaiting-review":
      return "watch";
    case "digest":
      return "digest";
  }
}

export type InboxAction =
  | "run-now"
  | "pause"
  | "resume"
  | "restart"
  | "dismiss"
  | "open-in-chat";

export interface DigestCounts {
  safe: number;
  needsYou: number;
  conflict: number;
  total: number;
}

export interface InboxItem {
  id: string;
  kind: InboxItemKind;
  notificationType: NotificationType;
  environmentId: string;
  environmentName: string;
  loopId?: string;
  title: string;
  detail?: string;
  occurredAt: string;
  outageSince?: string;
  dismissed: boolean;
  availableActions: InboxAction[];
  projectId?: string;
  prNumber?: number;
  prRepo?: string;
  prAuthor?: string;
  prUrl?: string;
  prVerdict?: PrVerdict;
  childItemIds?: string[];
  digestCounts?: DigestCounts;
}

export type InboxItemResolutionReason =
  | "loop-recovered"
  | "breach-cleared"
  | "instance-online"
  | "outage-resolved"
  | "watch-cleared"
  | "pr-resolved";

export interface ResolvedInboxItem {
  item: InboxItem;
  resolvedAt: string;
  resolution: InboxItemResolutionReason;
}

export interface InboxQueryResult {
  answer: string;
  references: InboxItem[];
}

export interface InboxBridge {
  getItems: () => Promise<InboxItem[]>;
  getDismissedIds: () => Promise<string[]>;
  dismissItem: (itemId: string) => Promise<void>;
  queryFleet: (question: string) => Promise<InboxQueryResult>;
  resolveItem: (resolved: ResolvedInboxItem) => Promise<void>;
  getResolvedItems: () => Promise<ResolvedInboxItem[]>;
  pruneResolvedItems: () => Promise<void>;
}

export type DeepLinkTarget =
  | { kind: "loop"; environmentId: string; loopId: string }
  | { kind: "instance"; environmentId: string }
  | { kind: "inbox-item"; environmentId: string; itemKind: InboxItemKind; itemId: string };

export interface NotificationSendArgs {
  title: string;
  body: string;
  /** Tag prevents duplicate notifications for the same event. */
  tag?: string;
  deepLink?: DeepLinkTarget;
  suppressIfFocused?: boolean;
}

export interface NotificationBridge {
  send: (args: NotificationSendArgs) => Promise<void>;
  setMuted: (muted: boolean) => Promise<void>;
  isMuted: () => Promise<boolean>;
  onClick: (cb: (deepLink: DeepLinkTarget) => void) => () => void;
}
