# Runtime Health Derivation

## Overview
The `deriveRuntimeHealth()` function in `src/renderer/src/runtime-health.ts` composes multiple existing health signals into a single, user-facing runtime usability state with five possible values.

## State Machine

### Inputs
| Signal | Source | Type |
|--------|--------|------|
| Reachability | `reachability[envId]` | `ReachabilityState` |
| Daemon health | `health[envId]` | `EnvironmentHealth` |
| OpenCode status | `openCodeStatus[envId]` | `OpenCodeConnectionStatus` |
| Stored runtime state | `environment.runtimeState` | `RuntimeState` |
| Agent runtime | `environment.agentRuntime` | `AgentRuntime` |

### Derivation Rules (priority order)
1. If reachability is `unreachable` or `reconnecting` → **unreachable** (overrides everything)
2. If daemon health is not `ok`:
   - If `runtimeState === "unavailable"` → **not-installed** (best-effort from stored state)
   - Otherwise → **unreachable** (can't probe runtime when daemon is down)
3. If agentRuntime is `opencode` AND openCodeStatus is available:
   - `errorKind === "unauthenticated"` → **auth-problem**
   - `errorKind === "rejected"` → **auth-problem**
   - `errorKind === "unreachable"` + `runtimeState === "unavailable"` → **not-installed**
   - `errorKind === "unreachable"` → **not-running**
   - `errorKind === "version"` → **not-running**
   - `authState === "authenticated"` → **ok**
   - `authState === "unauthenticated"` → **auth-problem**
   - Fallback: use `runtimeState`
4. For claude/other runtimes: use `runtimeState` directly:
   - `"available"` → **ok**
   - `"unavailable"` → **not-installed**
   - `"unknown"` / default → **not-running**

### Output
```typescript
interface RuntimeHealthInfo {
  state: RuntimeHealthState; // ok | not-running | not-installed | auth-problem | unreachable
  reason: string;            // Human-readable tooltip text
}
```

### Color Tokens
| State | CSS Variable | Visual |
|-------|-------------|--------|
| ok | --health-ok | Green |
| not-running | --health-connecting | Amber/yellow |
| not-installed | --health-offline | Red |
| auth-problem | --health-blocked | Purple |
| unreachable | --health-unknown | Gray |
