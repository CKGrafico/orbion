import Store from "electron-store";
import crypto from "node:crypto";
import type { SecurityAuditEvent } from "../shared/ipc.js";
import { createLogger } from "./logger.js";

const logger = createLogger("security-audit-log");

const MAX_EVENTS = 100;

interface SecurityAuditLogSchema {
  events: SecurityAuditEvent[];
}

const auditStore = new Store<SecurityAuditLogSchema>({
  name: "security-audit-log",
  defaults: {
    events: [],
  },
});

export function logSecurityEvent(event: Omit<SecurityAuditEvent, "id" | "timestamp">): void {
  const entry: SecurityAuditEvent = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...event,
  };

  const events = auditStore.get("events", []);
  events.push(entry);
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
  auditStore.set("events", events);
  logger.warn("Security audit event:", entry.kind, event.environmentId, event.credentialKind);
}

export function getSecurityAuditEvents(): SecurityAuditEvent[] {
  return auditStore.get("events", []);
}
