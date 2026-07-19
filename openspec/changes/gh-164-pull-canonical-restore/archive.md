# Archive: gh-164-pull-canonical-restore

## Change summary

Pull-canonical restore from the config-home: when Orbion connects to a config-home VM that has a `~/.orbion/config.json`, offer to restore instance records and preferences. Restored instances needing credentials prompt once. The VM's file is canonical: restore is pull-only, no merge.

## Acceptance criteria verification

- [x] Connecting to a config-home that has a config file offers restore; accepting rebuilds instance records and preferences from the file.
- [x] Restored instances needing credentials prompt once (into the keychain) — environments start as `unauthenticated`.
- [x] The VM's file is canonical: restore is pull-only, no merge — `pullRestore()` replaces local environments wholesale.

## Implementation notes

- Added `RestoreAvailability` and `PullRestoreResult` discriminated union types to `src/shared/ipc.ts`.
- Main-process functions `checkRestoreAvailable()` and `pullRestore()` in `config-store.ts` use SSH to read `~/.orbion/config.json` from the main-VM.
- `sanitizeRemoteEnvironment()` validates incoming data using the same allowlist approach as `sanitizeEnvironmentForSync()` — credential references are never imported, passwords are never imported.
- All restored environments start with `authState: "unauthenticated"` so the user is prompted once for credentials.
- IPC handlers wire the functions; post-restore seeds supervisors, tunnels, and MCP connections.
- Renderer shows a `RestoreOffer` modal after the first VM wizard completes if a restore is available.
- Mock adapter provides stub implementations for browser-only dev.
