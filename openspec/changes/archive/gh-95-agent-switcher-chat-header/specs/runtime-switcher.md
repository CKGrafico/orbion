# Agent runtime switcher spec

## ChatSession model

The `ChatSession` interface in `src/shared/ipc.ts` gains a required `activeRuntime: AgentRuntime` field. This is the runtime the session is currently using. It defaults to the environment's `agentRuntime` when the session is created.

## AgentRuntimeSwitcher component

Located at `src/renderer/src/components/AgentRuntimeSwitcher.tsx`.

Props:
- `value: AgentRuntime` - currently active runtime
- `instanceDefault: AgentRuntime` - the environment's default runtime
- `reachability: ReachabilityState | undefined` - instance reachability state
- `runtimeState: RuntimeState | undefined` - environment runtime state
- `onChange: (runtime: AgentRuntime) => void` - callback when user picks a different runtime

Rendering:
- Uses the `.segmented` / `.segment` CSS pattern (pill switcher).
- Two segments: "OpenCode" and "Claude".
- Active segment gets `.active` class.
- Unavailable runtimes render as disabled buttons with a tooltip reason.

Availability logic:
- If `reachability` is "unreachable" or "reconnecting", both options are disabled.
- The instance-default runtime is always considered available.
- If `runtimeState` is "unavailable", the non-default runtime is disabled.

## Transcript note on switch

When the user switches runtime via `handleRuntimeSwitch`, the handler:
1. Calls `configService.updateChatSession(sessionId, { activeRuntime: newRuntime })` to persist.
2. Calls `transcriptService.appendMessage()` with an assistant-role message noting the switch.
3. Refreshes local session state.

The transcript message uses the `agentSwitcher.switchedRuntime` i18n key and names the target runtime.

## i18n keys

- `agentSwitcher.label` - radio group aria label
- `agentSwitcher.opencode` - "OpenCode"
- `agentSwitcher.claude` - "Claude"
- `agentSwitcher.switchedRuntime` - "Switched runtime to {runtime}. Next message will use {runtime}."
- `agentSwitcher.unavailableReason` - "{runtime} is not available on this instance: {reason}"
