# Tasks — Reachability as its own health layer

- [x] Add `ReachabilityState`, `ReachabilityStatus`, `ReachabilityBridge` types to `shared/ipc.ts`
- [x] Add `ReachabilityState` export to `renderer/src/types.ts`
- [x] Create `ReachabilityTracker` in `main/reachability-tracker.ts`
- [x] Wire `ReachabilityTracker` into `main/index.ts` (supervisor onChange, IPC handlers, removeSupervisor cleanup)
- [x] Add IPC validation for `reachability:getStatus` and `reachability:getAll` in `main/ipc-validation.ts`
- [x] Add `reachability` sub-bridge to preload
- [x] Add `IReachabilityService` to renderer `services/interfaces.ts`
- [x] Create `ReachabilityService` (real) and `MockReachabilityService` in renderer
- [x] Register both in DI container (`services/container.ts`)
- [x] Update `App.tsx` to subscribe to reachability changes and pass to Sidebar
- [x] Update `fleet-mapping.ts`: `loopStatusToFleetItem` accepts optional reachability; unreachable → "idle" (not "failed")
- [x] Update `Sidebar.tsx`: accept reachability prop; render loops as "unknown" when unreachable
- [x] Update `FleetHealthFooter.tsx`: accept reachability; exclude unreachable loops from failure tallies
- [x] Add `sidebar.loopUnknown` i18n key
- [x] Update `ARCHITECTURE.md` with reachability documentation
