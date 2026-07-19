# Tasks — gh-104: Represent the full loop-task state model

- [ ] 1.1 Remove `"idle"` from `LoopStatus` type and update `STATUS_COLORS` to use distinct `--status-finished` (green) and `--status-stopped` (warm amber) <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/types.ts, src/renderer/src/format.ts] -->
- [ ] 1.2 Update theme.css: reassign `--status-finished` to success green and `--status-stopped` to warm amber <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/theme.css] -->
- [ ] 2.1 Add `"paused"` and `"stopped"` to `FleetItemStatus`, update `fleet-mapping.ts` so all 6 loop states map to distinct fleet items <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/fleet-mapping.ts, src/renderer/src/fleet-status.ts] -->
- [ ] 2.2 Update `fleet-status.ts` PILL_COLORS and labels for new `"paused"` and `"stopped"` fleet items <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/fleet-status.ts] -->
- [ ] 3.1 Update `LoopSummaryBar` to include `stopped` as an exception status with distinct color <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/components/LoopSummaryBar.tsx] -->
- [ ] 3.2 Update `LoopCard` pulse/animation behavior to handle the corrected state set <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [src/renderer/src/components/LoopCard.tsx] -->
- [ ] 4.1 Update i18n en.json: remove `idle`-specific keys, add `statusStopped` / `statusWaiting` clarity, add fleet `paused`/`stopped` pill labels <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [src/renderer/src/i18n/en.json] -->
- [ ] 5.1 Update mock adapter: change any `"idle"` status loops to `"waiting"` <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [src/renderer/src/services/mock/MockServices.ts] -->
- [ ] 6.1 Remove remaining `"idle"` references from `LoopDetail`, sidebar, and any other consumers <!-- agent: frontend-engineer.fast, depends_on: [1.1, 2.1], touches: [src/renderer/src/components/LoopDetail.tsx, src/renderer/src/components/Sidebar.tsx] -->
