# Tasks — Escalate Prolonged Instance Unreachability

## ✅ Completed

- [x] **T1: OutageTracker module** — `src/main/outage-tracker.ts`
  - Tracks outage start time per environment
  - Schedules threshold check (default 10 min)
  - Fires `onEscalate` callback with environmentId, since timestamp, durationMs
  - Fires `onResolve` callback on reconnect
  - `removeEnvironment()` for cleanup on environment deletion
  - `destroy()` for app shutdown cleanup

- [x] **T2: IPC types** — `src/shared/ipc.ts`
  - Added `prolonged-offline` to `InboxItemKind`
  - Added `outageSince` field to `InboxItem`
  - Added `OutageEscalation` interface
  - Added `OutageBridge` interface
  - Added `outage` field to `LoopTaskBridge`

- [x] **T3: Preload bridge** — `src/preload/index.ts`
  - `outage.onEscalation` → `ipcRenderer.on("outage:escalation")`
  - `outage.onResolve` → `ipcRenderer.on("outage:resolve")`
  - `outage.getEscalations` → `ipcRenderer.invoke("outage:getEscalations")`

- [x] **T4: Main process wiring** — `src/main/index.ts`
  - Instantiate `OutageTracker` with escalation + resolve callbacks
  - Wire supervisor status changes → `outageTracker.handleStatusChange()`
  - Send OS notification on escalation via `notificationService.send()`
  - Forward escalation/resolve events to renderer via `webContents.send()`
  - Add `outage:getEscalations` IPC handler
  - Clean up tracker on environment removal

- [x] **T5: Renderer services** — interfaces + implementations
  - `IOutageService` interface in `services/interfaces.ts`
  - `OutageService` in `services/impl/OutageService.ts`
  - `MockOutageService` in `services/mock/MockServices.ts`
  - `escalatedOutages` field in `InboxBuildParams`
  - DI registration in `services/container.ts`

- [x] **T6: InboxService changes** — `services/impl/InboxService.ts`
  - `deriveItems` uses `escalatedOutages` map
  - `prolonged-offline` items with `outageSince` + duration detail
  - `formatDuration` helper for human-readable durations
  - Updated `answerFleetQuery` to label prolonged-offline items

- [x] **T7: App.tsx integration**
  - Subscribe to `outageService.onEscalation` and `onResolve`
  - Maintain `escalatedOutages` state map
  - Pass to `InboxPanel` props
  - Handle `prolonged-offline` deep-link navigation

- [x] **T8: InboxPanel updates** — `features/inbox/InboxPanel.tsx`
  - Accept `escalatedOutages` prop
  - Pass to `InboxBuildParams`
  - Visual: distinct icon (⏻) and warning-class dot for prolonged-offline

- [x] **T9: i18n string** — `i18n/en.json`
  - Added `inbox.prolongedOffline` key
