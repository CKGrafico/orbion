# gh-164-pull-canonical-restore

## Summary

Pull-canonical restore from the config-home: when Orbion connects to a config-home VM that has a `~/.orbion/config.json`, offer to restore instance records and preferences. Restored instances that need credentials prompt once (into the keychain). The VM's file is canonical: restore is pull-only, never a two-way merge.

## Motivation

On a new machine, after seeding and authenticating, users must manually re-enter every instance connection. The config-home already holds a trusted, canonical config file. Pulling it rebuilds the setup with one action instead of N wizard runs.

## Design

### Flow

1. **Detection**: After the wizard completes (or on environment load), if the connected environment has role `main-vm` and the file `~/.orbion/config.json` exists on the VM, the main process signals the renderer that a restore is available.
2. **Offer**: The renderer shows a one-time restore card/dialog explaining what will happen (pull-only, no merge, credentials need re-entry).
3. **Pull**: If the user accepts, the main process reads `~/.orbion/config.json` over SSH (or via the daemon API), deserializes the environments, and writes them to the local electron-store using `sanitizeEnvironmentForSync`-compatible parsing.
4. **Credential prompts**: For each restored environment that had `credentialRefs`, the renderer shows a single re-auth prompt (pairing code or SSH key passphrase). The config file stores only references, not secrets.
5. **Post-restore**: Supervisors and tunnels are seeded for the new environments. The user lands in a fully populated state.

### Key invariants

- **Pull-only, no merge**: The VM's file is canonical. Local config is replaced wholesale if the user accepts. A stale-overwrite warning is shown if local environments exist that aren't in the remote file.
- **No secrets on the wire**: The config file contains `credentialRefs` (opaque references) but no credential values. Restored environments that need auth start as `unauthenticated` and prompt once.
- **The config file is `~/.orbion/config.json`**: Written by Orbion on the main-VM (already exists in the codebase as the electron-store persistence path). It is `chmod 600`.

### New IPC channels

- `config:checkRestoreAvailable` — asks if the main-VM has a config file available for restore.
- `config:pullRestore` — performs the pull-canonical restore, replacing local environments with those from the VM's config.

### Files touched

- `src/shared/ipc.ts` — new types: `RestoreAvailability`, `PullRestoreResult`, new methods on `ConfigBridge`
- `src/main/config-store.ts` — `checkRestoreAvailable()`, `pullRestore()` functions
- `src/main/index.ts` — new IPC handlers
- `src/main/vm-wizard.ts` — fire `checkRestoreAvailable` after wizard completes
- `src/preload/index.ts` — wire new bridge methods
- `src/renderer/src/services/interfaces.ts` — `IConfigService` additions
- `src/renderer/src/services/impl/ConfigService.ts` — delegate to bridge
- `src/renderer/src/services/mock/MockServices.ts` — mock restore methods
- `src/renderer/src/components/ColdOpen.tsx` — add restore offer flow after seed import
- `src/renderer/src/App.tsx` — wire restore offer after wizard completes for seed-started VMs
- `src/renderer/src/i18n/` — new i18n keys for restore flow

## Acceptance criteria

- Connecting to a config-home that has a config file offers restore; accepting rebuilds instance records and preferences from the file.
- Restored instances needing credentials prompt once (into the keychain).
- The VM's file is canonical: restore is pull-only, no merge.
