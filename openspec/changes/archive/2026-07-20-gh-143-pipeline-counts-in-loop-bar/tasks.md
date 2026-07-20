# Tasks: Pipeline counts in the loop bar

## Change ID

gh-143-pipeline-counts-in-loop-bar

### Task 1: Add projectPipelineLabels to config store + IPC + validation

- [ ] 1.1 Add `projectPipelineLabels` to ConfigSchema in config-store.ts + CRUD functions <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/config-store.ts] -->
- [ ] 1.2 Add getProjectPipelineLabels/setProjectPipelineLabels to ConfigBridge in shared/ipc.ts <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->
- [ ] 1.3 Wire config:getProjectPipelineLabels and config:setProjectPipelineLabels IPC handlers in main/index.ts <!-- agent: frontend-engineer.build, depends_on: [1.1, 1.2], touches: [src/main/index.ts] -->
- [ ] 1.4 Add IPC validators in ipc-validation.ts <!-- agent: frontend-engineer.fast, depends_on: [1.2], touches: [src/main/ipc-validation.ts] -->
- [ ] 1.5 Expose new bridge methods in preload/index.ts <!-- agent: frontend-engineer.fast, depends_on: [1.2], touches: [src/preload/index.ts] -->

### Task 2: Add pipeline labels to renderer services

- [ ] 2.1 Add getProjectPipelineLabels/setProjectPipelineLabels to IConfigService interface <!-- agent: frontend-engineer.fast, depends_on: [1.2], touches: [src/renderer/src/services/interfaces.ts] -->
- [ ] 2.2 Implement in ConfigService.ts <!-- agent: frontend-engineer.fast, depends_on: [2.1], touches: [src/renderer/src/services/impl/ConfigService.ts] -->
- [ ] 2.3 Add mock implementations in MockServices.ts <!-- agent: frontend-engineer.fast, depends_on: [2.1], touches: [src/renderer/src/services/mock/MockServices.ts] -->

### Task 3: Create usePipelineCounts hook

- [ ] 3.1 Create usePipelineCounts hook that polls issue counts per label <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/components/usePipelineCounts.ts] -->

### Task 4: Extend LoopSummaryBar with pipeline segments

- [ ] 4.1 Add pipeline segment rendering + onPipelineSegmentClick prop to LoopSummaryBar <!-- agent: frontend-engineer.build, depends_on: [3.1], touches: [src/renderer/src/components/LoopSummaryBar.tsx] -->
- [ ] 4.2 Add i18n keys for pipeline segments <!-- agent: frontend-engineer.fast, depends_on: [4.1], touches: [src/renderer/src/i18n/en.json] -->
- [ ] 4.3 Add pipeline segment CSS styles <!-- agent: frontend-engineer.fast, depends_on: [4.1], touches: [src/renderer/src/theme.css] -->

### Task 5: Wire pipeline labels and counts through App.tsx and SessionChatView

- [ ] 5.1 Load pipeline labels per session project in App.tsx, pass to SessionChatView <!-- agent: frontend-engineer.build, depends_on: [2.1, 4.1], touches: [src/renderer/src/App.tsx] -->
- [ ] 5.2 Wire pipeline counts in SessionChatView (usePipelineCounts, onPipelineSegmentClick callback) <!-- agent: frontend-engineer.build, depends_on: [3.1, 4.1, 5.1], touches: [src/renderer/src/components/SessionChatView.tsx] -->

### Task 6: Verification

- [ ] 6.1 Run pnpm typecheck and fix any errors <!-- agent: frontend-engineer.fast, depends_on: [1.3, 1.4, 1.5, 2.2, 2.3, 3.1, 4.1, 4.2, 4.3, 5.1, 5.2], touches: [] -->
