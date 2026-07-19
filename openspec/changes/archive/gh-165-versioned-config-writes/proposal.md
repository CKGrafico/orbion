# Versioned config writes with stale-overwrite warning

## Issue

GitHub #165

## Summary

Every config write is now stamped with a timestamp + monotonic revision. Before writing, Orbion compares the file's current stamp against the caller's last-known stamp. If the remote is newer, a warning dialog offers pull-remote or overwrite-anyway. Last-write-wins remains the model; this is a guardrail, not a merge system.

## Acceptance criteria

- [x] Every write is stamped (timestamp + monotonic revision); before writing, Orbion compares against the file's current stamp.
- [x] If the remote is newer than this machine's last-known state, warn and offer pull-remote / overwrite-anyway.
- [x] Last-write-wins remains the model; this is a guardrail, not a merge system.

## Design decisions

- **Stamp storage:** A `ConfigStamp { timestamp: number; revision: number }` field is added to the `ConfigSchema` in `electron-store`. It is bumped on every mutating write via `bumpStamp()` calls in the mutation helpers and direct `store.set()` sites.
- **Stamp-checked writes:** New IPC channels `config:getConfigStamp`, `config:stampCheckedSetMainVm`, and `config:forceSetMainVm`. The stamp-checked variant reads the caller's `knownStamp`, compares it against the on-disk stamp, and returns a `StaleConfigResult` on conflict.
- **UI flow:** The `StaleConfigWarning` component shows a modal with three choices: pull-remote (uses existing `pullRestore`), overwrite-anyway (uses `forceSetMainVm`), and skip. It follows the same visual language as `RestoreOffer`.
- **Scope:** The stamp-checked write is exercised when the user designates a main VM (the "mark as main" action and the PickMainVmModal). Other config mutations (add/remove environment, etc.) still use last-write-wins without stamp checking, consistent with the issue's scope.

## Files changed

- `src/shared/ipc.ts` — `ConfigStamp`, `StaleConfigResult`, `StampCheckedWriteResult` types; new `ConfigBridge` methods
- `src/main/config-store.ts` — `configStamp` in schema, `bumpStamp()`, `getConfigStamp()`, `stampCheckedSetMainVm()`, `forceSetMainVm()`
- `src/main/index.ts` — IPC handlers for the three new channels
- `src/preload/index.ts` — Bridge entries for the new config methods
- `src/renderer/src/services/interfaces.ts` — `IConfigService` additions
- `src/renderer/src/services/impl/ConfigService.ts` — Real implementation
- `src/renderer/src/services/mock/MockServices.ts` — Mock implementation with stamp tracking
- `src/renderer/src/store.ts` — `stampCheckedSetMainVm` and `forceSetMainVm` in `useEnvironments`
- `src/renderer/src/App.tsx` — Stamp-checked set-main-VM flow, `StaleConfigWarning` integration
- `src/renderer/src/components/StaleConfigWarning.tsx` — New stale config warning modal
- `src/renderer/src/i18n/en.json` — `staleConfig.*` i18n keys
- `src/renderer/src/theme.css` — `.stale-config-*` styles
