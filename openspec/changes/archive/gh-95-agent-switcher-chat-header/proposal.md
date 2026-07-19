# Agent switcher (Claude / OpenCode) in the chat header

## Summary

Add a segmented control to the chat session header that lets the user switch between OpenCode and Claude runtimes mid-conversation. The instance default is preselected. Switching takes effect on the next message and is noted in the transcript. If a runtime is unavailable on the home instance, its option is disabled with a reason.

## Motivation

Users work with different runtimes for different tasks. A developer may start a session on OpenCode but want to switch to Claude Code for a code review task. Currently the runtime is fixed at environment creation time. The issue requests in-session runtime switching that takes effect immediately.

## Acceptance criteria

- Segmented control shows the two runtimes; the instance default is preselected.
- Switching takes effect next message; the transcript notes it.
- If a runtime is unavailable on the home instance, its option is disabled with the reason.

## Design decisions

- **Per-session state.** `activeRuntime` is stored on the `ChatSession` model (not the environment). This allows two sessions on the same instance to use different runtimes, matching the design model's separation of filing vs runtime.
- **Transcript note.** On switch, an assistant-role message is appended to the transcript via `TranscriptService.appendMessage`. This ensures the switch is visible in the history and persists across restarts.
- **Availability derivation.** The switcher derives runtime availability from the same signals used by `RuntimeHealthChip`: reachability state and `runtimeState` on the environment. If the instance is unreachable, both options are disabled. If `runtimeState` is `"unavailable"`, the non-default runtime is disabled with "Not installed on this instance".
- **Existing CSS.** Uses the `.segmented` / `.segment` pill-switcher pattern already defined in `theme.css`.

## Files touched

- `src/shared/ipc.ts` - Added `activeRuntime: AgentRuntime` to `ChatSession`; widened `updateChatSession` type
- `src/main/config-store.ts` - Updated `updateChatSession` signature
- `src/main/index.ts` - Updated IPC handler type
- `src/main/ipc-validation.ts` - Added `activeRuntime` validation
- `src/renderer/src/App.tsx` - Integrated `AgentRuntimeSwitcher` in session header; added `handleRuntimeSwitch`
- `src/renderer/src/components/AgentRuntimeSwitcher.tsx` - New component
- `src/renderer/src/i18n/en.json` - Added i18n keys
- `src/renderer/src/services/interfaces.ts` - Widened `IConfigService.updateChatSession`
- `src/renderer/src/services/impl/ConfigService.ts` - Widened implementation
- `src/renderer/src/services/mock/MockServices.ts` - Added `activeRuntime` to mock sessions
