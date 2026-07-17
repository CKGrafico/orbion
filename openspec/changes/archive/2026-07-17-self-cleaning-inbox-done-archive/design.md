## Context

The Orbion inbox currently derives items from live fleet data (failed loops, budget breaches, offline instances, prolonged outages). Items leave the active list only through manual dismissal. The OutageTracker already self-resolves prolonged-offline items when the instance reconnects (it fires `onResolve`, which removes the escalation from the Map), but this is invisible to the user: the item just vanishes without any record. Failed-loop items remain until dismissed even if the loop succeeds on its next run. Budget breaches remain until dismissed even if the run count drops below the threshold.

The inbox should be self-cleaning: resolved items leave the active list automatically but persist in a Done archive (off by default) with resolution info and a 30-day retention cap.

Constraints:
- The inbox is a renderer-computed view over live data plus persisted dismissed/resolved state in the main process (electron-store).
- All IPC goes through `window.api` (contextBridge); the renderer never touches the network or filesystem directly.
- The mock adapter must work in browser-only mode (`pnpm dev:web`).
- Strict TypeScript; no `any`.
- plain CSS with custom-property design tokens; i18n for all user-facing strings.

## Goals / Non-Goals

**Goals:**
- Inbox items auto-resolve when their condition clears (failed loop next run succeeds, breach count drops below threshold, prolonged-offline reconnects) and leave the active list with no user gesture.
- A Done toggle/tab in the InboxPanel shows resolved items with resolution timestamp and reason.
- Resolved items older than 30 days are pruned automatically.
- Persisted resolved-item state survives app restarts (electron-store in main process).

**Non-Goals:**
- No backend / daemon changes. This is purely an Orbion-side feature.
- No undo for auto-resolution (items that auto-resolve are simply no longer active; they stay in Done for 30 days).
- No custom retention period UI (30-day cap is hardcoded for now).
- No notification when items auto-resolve (silent self-cleaning).
- No changes to the conversational query engine beyond showing Done items when the toggle is active.

## Decisions

### D1: Resolution tracking via persisted store in main process

**Decision:** When an item auto-resolves, the renderer detects this (by comparing the previously active item set with the currently derived set) and sends the resolved item details to the main process via a new `inbox:resolveItem` IPC channel. The main process stores resolved items in electron-store under `inboxResolvedItems` with a 30-day TTL.

**Rationale:** Keeps the main process as the source of truth for persisted state, consistent with the existing dismissed-IDs pattern. The renderer computes whether items are active; the main process persists what was resolved.

**Alternative considered:** Purely renderer-side localStorage. Rejected because it breaks the existing boundary: config/persistence belongs in the main process (per ARCHITECTURE.md), and localStorage is only a mock-mode fallback.

### D2: Detection of auto-resolution in the renderer

**Decision:** Use a `useEffect`-based diffing approach in the InboxPanel (or a custom hook). On each poll cycle (every 5s when loop data refreshes), compare the previous set of active item IDs with the current set. Items present in previous but absent in current (and not in the dismissed set) are auto-resolved. Emit resolve events for each.

**Rationale:** The renderer already recomputes items on every data change. The diff is a simple set subtraction. This avoids any coupling to specific condition-checkers and works uniformly across all item kinds (failed-loop, breach, offline, prolonged-offline).

**Alternative considered:** Per-kind condition tracking (e.g., check if a failed loop's current status is no longer failed). More precise but more complex and fragile. The diffing approach is simpler, kind-agnostic, and naturally handles edge cases.

### D3: Done toggle design

**Decision:** Add a segmented toggle pill in the inbox header: "Active | Done". Active is the default. The Done view shows resolved items sorted by resolvedAt descending, each with the original item info plus resolution metadata (resolvedAt timestamp, resolution reason). The count chip shows the active count (unchanged behavior).

**Rationale:** Matches the existing segmented pill switcher component pattern in the codebase. Keeps the inbox clean by default (Active view) while making the audit trail one click away.

**Alternative considered:** Always-visible Done section below Active. Rejected because it takes up valuable sidebar space and the issue says "off by default."

### D4: Resolution reason text

**Decision:** The resolution reason is a short, deterministic string per item kind:
- `failed-loop` → "loop recovered (next run succeeded)"
- `breach` → "runs dropped below threshold"
- `instance-offline` → "instance came back online"
- `prolonged-offline` → "instance reconnected after prolonged outage"

These are stored alongside the resolved item and displayed in the Done view. They are not i18n'd at the storage layer; i18n happens at display time using key-based resolution.

**Rationale:** Simple, honest, no fabricated data. The text describes what Orbion actually observed (the condition cleared).

## Risks / Trade-offs

- [Diffing false positives] → If the poll interval causes an item to flicker (briefly absent then present again), it could be spuriously resolved. Mitigation: only resolve items that were present in the previous computation and are absent in the current one AND were not just dismissed. A brief flicker would re-derive the item on the next poll, which is fine since auto-resolved items only leave Active, they don't prevent re-creation.
- [Storage growth] → Resolved items accumulate over 30 days. Mitigation: the 30-day TTL prunes old entries on every read. In practice, this is a small dataset (< 1KB per item, capped at hundreds of items).
- [Mock parity] → MockInboxService must mirror the resolution logic. Mitigation: keep mock simple; use a local array with TTL filtering.
