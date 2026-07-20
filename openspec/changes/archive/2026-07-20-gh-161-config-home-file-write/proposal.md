## Why

Orbion stores its config locally in electron-store, but there is no mechanism to persist it to the designated config-home VM. Without this, a user's config is lost if the local machine dies, and pull-canonical restore (`gh-164`) has no remote file to restore from. The config-home VM must become the durable source of truth, written to on every meaningful local change.

## What Changes

- Add a debounced "config-sync writer" in the main process that, after any config mutation, serializes the sanitized environment list to plain JSON and writes it to `~/.orbion/config.json` on the main-VM over the existing SSH/local reach.
- The remote file is written with `chmod 600` (owner read/write only).
- Loop-task is not involved or modified; this is purely an Orbion-side write.
- Writes happen only on meaningful changes (debounced, 2s), not on every stamp bump.
- Uses the existing `sshOnMainVm` helper for SSH reach, and falls back to local `fs` for direct/local endpoints where the "VM" is the same machine.
- No new IPC channel or renderer change is needed — this is entirely main-process infrastructure, triggered by `bumpStamp()`.

## Capabilities

### New Capabilities
- `config-home-sync`: Debounced write of sanitized Orbion config to the config-home VM's `~/.orbion/config.json` on every meaningful config change, using the existing SSH/direct reach.

### Modified Capabilities
<!-- No existing spec-level behavior changes -->

## Impact

- **Main process** (`src/main/config-store.ts`): new `syncConfigToMainVm()` function called from `bumpStamp()`, debounced write logic.
- **Main process** (`src/main/index.ts`): no changes needed — sync is wired into `bumpStamp()` automatically.
- **Shared types** (`src/shared/ipc.ts`): no changes — this is purely main-process internal.
- **Preload/Renderer**: no changes.
- **Existing `sshOnMainVm` helper**: extended to support write commands (currently read-only).
- **Existing `sanitizeEnvironmentForSync`**: reused as-is for the JSON payload.
- **No loop-task changes**: the daemon is not involved.
