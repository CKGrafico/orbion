# Tasks — Runtime health chip (#86)

## Task 1: Add RuntimeHealthState derivation logic
- **Files:** `src/renderer/src/runtime-health.ts` (new)
- **What:** Create `deriveRuntimeHealth()`, `RuntimeHealthState` type, `RuntimeHealthInfo` interface, and `RUNTIME_HEALTH_COLORS` map
- **Depends on:** —
- **Touches:** new file only
- **Agent:** default
- **Tier:** 1
- **Verify:** typecheck passes

## Task 2: Add agentRuntime and runtimeState to renderer Environment type
- **Files:** `src/renderer/src/types.ts`
- **What:** Add `agentRuntime?: AgentRuntime` and `runtimeState?: RuntimeState` fields to the renderer-local `Environment` interface, plus re-export those types from shared IPC
- **Depends on:** —
- **Touches:** types.ts only
- **Agent:** default
- **Tier:** 1
- **Verify:** typecheck passes

## Task 3: Create RuntimeHealthChip component
- **Files:** `src/renderer/src/components/RuntimeHealthChip.tsx` (new)
- **What:** React component that receives environment/health/reachability/openCodeStatus/runtimeState, calls `deriveRuntimeHealth()`, and renders a chip (colored dot + label, reason on title)
- **Depends on:** Task 1, Task 2
- **Touches:** new file only
- **Agent:** default
- **Tier:** 1
- **Verify:** typecheck passes

## Task 4: Wire into App.tsx + add periodic refresh
- **Files:** `src/renderer/src/App.tsx`
- **What:** Import RuntimeHealthChip, add it to the instance header after HTTP/MCP chips. Add a 30s periodic `openCodeService.refreshStatus()` effect for the selected environment
- **Depends on:** Task 3
- **Touches:** App.tsx
- **Agent:** default
- **Tier:** 2
- **Verify:** typecheck passes

## Task 5: Add i18n messages
- **Files:** `src/renderer/src/i18n/en.json`
- **What:** Add `runtimeHealth.*` keys for all 5 state labels and ~10 reason strings
- **Depends on:** —
- **Touches:** en.json only
- **Agent:** default
- **Tier:** 1
- **Verify:** typecheck passes

## Task 6: Update mock services
- **Files:** `src/renderer/src/services/mock/MockServices.ts`
- **What:** MockOpenCodeService returns differentiated statuses based on environment name; mock environments include `runtimeState: "available"`
- **Depends on:** —
- **Touches:** MockServices.ts only
- **Agent:** default
- **Tier:** 1
- **Verify:** typecheck passes
