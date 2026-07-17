# Spec: NotificationType model

## Type definition

```typescript
export type NotificationType = "failure" | "finished" | "watch" | "digest";
```

## Kind-to-type mapping

| InboxItemKind | NotificationType |
|---|---|
| failed-loop | failure |
| instance-offline | failure |
| prolonged-offline | failure |
| finished-loop | finished |
| breach | watch |
| pending-approval | watch |
| awaiting-input | watch |
| digest | digest |

## Visual treatment

| NotificationType | Icon (InboxView) | Dot (InboxPanel) | Color |
|---|---|---|---|
| failure | XCircle | ! | var(--danger) / --nt-failure |
| finished | CheckCircle2 | ✓ | var(--success) / --nt-finished |
| watch | AlertTriangle | ! | var(--warning) / --nt-watch |
| digest | Layers | ≡ | var(--accent-infra) / --nt-digest |

## Transition detection

The `useLoopTransitions` hook compares per-loop snapshots across 5-second poll cycles. It emits transitions only after the first poll cycle (avoiding first-load flooding). Finished takes precedence over failure when both conditions apply simultaneously (matching inbox derivation logic).

## Resolution reason mapping

| NotificationType | ResolutionReason |
|---|---|
| failure | loop-recovered, instance-online, outage-resolved |
| finished | loop-recovered |
| watch | watch-cleared |
| digest | watch-cleared |
