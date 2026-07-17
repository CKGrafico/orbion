## Why

The inbox currently accumulates items that never leave unless the user manually dismisses them. A failed-loop inbox item stays forever even after the next run succeeds; a prolonged-offline item lingers even after the instance reconnects (until the OutageTracker fires onResolve, which only clears the escalation state, not the dismissed-set). The inbox should mean "what needs me now," not "everything that ever went wrong." Resolved items should leave the active list automatically but remain accessible in a Done archive so the audit trail is preserved.

## What Changes

- Items auto-resolve when their condition clears: a failed loop whose next run succeeds leaves the active list with no user gesture; budget breaches clear when runs drop below threshold; prolonged-offline items clear on reconnect (already partially handled by OutageTracker, but the UI never marks them Done, they just vanish).
- Add a `resolvedAt` and `resolution` field to the InboxItem type so auto-resolved items carry resolution info.
- Introduce a Done tab/toggle in the InboxPanel (off by default) that lists resolved items with their resolution info (how/when they resolved).
- Retention cap: resolved items older than 30 days are pruned from the Done list.
- The `IInboxService` gains methods to track resolved items and query the Done archive.
- Persist resolved-item state in the main process (electron-store) so the Done view survives app restarts.
- Add corresponding IPC channels and preload bridge methods for resolved-item management.
- Add mock counterparts for browser-only development.
- Add i18n keys for all new user-facing strings.
- Add CSS styles for the Done tab/toggle and resolved-item display.

## Capabilities

### New Capabilities
- `inbox-auto-resolve`: Auto-resolution of inbox items when their condition clears, plus Done archive view with retention cap.

### Modified Capabilities
_(none existing specs are modified)_

## Impact

- `src/shared/ipc.ts`: InboxItem type extended with `resolvedAt`/`resolution` fields; new `InboxBridge` methods; new IPC channels.
- `src/renderer/src/services/interfaces.ts`: `IInboxService` extended with resolve/archive methods; `InboxBuildParams` extended.
- `src/renderer/src/services/impl/InboxService.ts`: Core auto-resolution logic (items leave active list when condition clears), Done archive query.
- `src/renderer/src/services/mock/MockServices.ts`: Mock implementations for new methods.
- `src/renderer/src/features/inbox/InboxPanel.tsx`: Done tab/toggle UI, resolved-item display.
- `src/renderer/src/theme.css`: Styles for Done tab and resolved items.
- `src/renderer/src/i18n/en.json`: New i18n keys.
- `src/main/config-store.ts`: Persisted resolved-item state.
- `src/main/index.ts`: New IPC handlers for resolved items.
- `src/preload/index.ts`: New bridge methods.
