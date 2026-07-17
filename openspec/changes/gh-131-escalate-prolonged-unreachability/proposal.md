# Escalate Prolonged Instance Unreachability to the Inbox

## Change ID
`gh-131-escalate-prolonged-unreachability`

## Summary
When an instance (environment) stays unreachable past a configurable threshold (default ~10 min), create an inbox item of kind `prolonged-offline` plus a native OS notification naming the instance and duration. The item self-resolves on reconnect. Outages shorter than the threshold produce no inbox item.

## Motivation
The existing inbox shows every offline instance as `instance-offline` immediately. This means brief blips (SSH tunnel reconnection, VM reboot) create transient noise. The design doc specifies: "Orbion owns the tunnel and reconnects with backoff quietly; only a prolonged outage escalates to the inbox."

## Approach
1. **New `OutageTracker` class** in `src/main/outage-tracker.ts` — observes `ConnectionSupervisor` status changes, tracks outage start times, fires escalation after threshold (10 min default), and fires resolution on reconnect.
2. **IPC contract** — added `OutageEscalation` type, `OutageBridge` (with `onEscalation`, `onResolve`, `getEscalations`), and `prolonged-offline` inbox item kind to `src/shared/ipc.ts`.
3. **Preload bridge** — wired the outage IPC channels.
4. **Renderer services** — new `OutageService` (DI-registered), `IOutageService` interface, `escalatedOutages` field in `InboxBuildParams`.
5. **InboxService** — `deriveItems` now produces `prolonged-offline` items (with `outageSince` and human-readable duration) for escalated outages, and falls back to `instance-offline` for short outages.
6. **OS notifications** — the main-process `OutageTracker` callback sends a native Electron notification with instance name + duration, deep-linking to the instance view.
7. **Self-resolution** — when the instance reconnects, the tracker fires `outage:resolve`, which removes the item from the inbox.
8. **Mock adapter** — `MockOutageService` provides no-op stubs for browser-only dev.

## Tasks
See `tasks.md`
