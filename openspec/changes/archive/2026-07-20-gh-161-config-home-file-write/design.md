## Context

Orbion stores its config locally in `electron-store` (`config-store.ts`). The concept of a "config-home VM" was introduced with `gh-162` (references-not-secrets) and `gh-164` (pull-canonical restore): a designated main-VM holds the canonical `~/.orbion/config.json`, and new machines can restore from it. However, Orbion currently only *reads* this file (for restore); it never *writes* to it. The missing piece is a debounced write-on-change mechanism that keeps the remote file in sync with local config mutations.

The existing `sshOnMainVm()` helper in `config-store.ts` already runs commands over SSH to the main-VM. The existing `sanitizeEnvironmentForSync()` and `getEnvironmentsForRenderer()` already produce a secret-free, IPC-safe JSON representation. The `bumpStamp()` function is called on every config mutation — making it the natural trigger point for a sync.

## Goals / Non-Goals

**Goals:**
- After any meaningful config change (add/remove environment, set main-VM, update endpoint, etc.), Orchion writes the sanitized config to `~/.orbion/config.json` on the config-home VM.
- Writes are debounced (2 seconds) to coalesce rapid mutations (wizard steps, bulk updates).
- The remote file is `chmod 600` (owner read/write only) so no other user on the VM can read the config.
- Works over the existing SSH reach for remote VMs, and via local `fs` for direct/local endpoints.
- Loop-task is not involved or modified.
- No new IPC channels are needed — the sync is entirely main-process infrastructure.

**Non-Goals:**
- Two-way merge / conflict resolution (already handled by pull-canonical restore and stamp-checked writes).
- Real-time push notifications to other Orbion instances (the stamp mechanism handles conflict detection).
- Writing loop-task-specific configuration (the daemon is separate).
- Modifying the renderer or preload layer.

## Decisions

### 1. Trigger: hook into `bumpStamp()` with a debounced side-effect

**Decision**: Call a `scheduleConfigSyncToMainVm()` function at the end of `bumpStamp()`, which resets a 2-second debounce timer. When the timer fires, the sync executes.

**Rationale**: `bumpStamp()` is already called on every config mutation. Adding the sync there ensures no mutation is missed. The debounce coalesces rapid successive mutations (e.g. the wizard adding environment + endpoint + auth state in quick succession). The 2s window is long enough to batch nearby changes but short enough that the user won't notice delay.

**Alternative considered**: Observer pattern on `electron-store` changes. Rejected because `bumpStamp()` is already the authoritative mutation signal and avoids the complexity of deep-watching the store.

### 2. Transport: extend `sshOnMainVm()` to support write commands

**Decision**: The existing `sshOnMainVm()` runs a command and returns stdout. For writing, we pipe the JSON payload via stdin to a remote `tee` command: `mkdir -p ~/.orbion && cat > ~/.orbion/config.json && chmod 600 ~/.orbion/config.json`. The JSON is passed as stdin to `execFile("ssh", ...)`.

**Rationale**: This avoids writing the config to a temporary file and then moving it — a single SSH command with stdin is atomic at the SSH level. `chmod 600` ensures correct permissions. The `mkdir -p` handles first-run scenarios.

**Alternative considered**: Write to a temp file on the VM, then `mv`. Rejected because it requires two SSH commands and introduces a partial-write window.

### 3. Local/direct endpoints: write via Node.js `fs`

**Decision**: For environments where the active endpoint is `kind: "direct"` (the "VM" is the local machine), write directly via `fs.mkdirSync` + `fs.writeFileSync` + `fs.chmodSync`.

**Rationale**: SSH to localhost is wasteful and may not even work (no SSH server running). Direct filesystem writes are simpler and more reliable.

### 4. Payload: `sanitizeEnvironmentForSync` for each environment

**Decision**: Reuse the existing `sanitizeEnvironmentForSync()` / `getEnvironmentsForRenderer()` to produce the environments array, then wrap it in `{ environments: [...], configStamp: { ... } }` for the remote file.

**Rationale**: The same allowlist-based sanitization that protects the IPC boundary also protects the remote file. No secret can leak into the file. The stamp is included so that pull-restore can detect stale vs. current remote state.

### 5. Error handling: silent failures with console logging

**Decision**: If the SSH write or local write fails, log the error and return. Do not throw or surface an error to the user. The next successful mutation will trigger another sync attempt.

**Rationale**: The config-file-on-VM is a best-effort durability mechanism. The primary store is still the local electron-store. A transient SSH failure should not block the user's workflow. The debounced retry on next mutation provides automatic recovery.

## Risks / Trade-offs

- **SSH timeout blocking**: The SSH command has a 15s timeout. If the main-VM is slow or unreachable, the sync will take up to 15s, but since it runs asynchronously and doesn't block the IPC chain, this is acceptable. → *Mitigation*: Fire-and-forget async; next mutation retries.
- **Concurrent Orbion instances**: Two Orbion instances writing to the same remote file simultaneously could cause interleaved writes. → *Mitigation*: The remote file is written atomically via `cat > file` (single write syscall for small files). The stamp mechanism detects and warns about stale state. This is explicitly last-write-wins.
- **Large config payloads**: With many environments, the JSON could be large. → *Mitigation*: The sanitized config is small (no secrets, no session tokens). Even 100 environments would be well under 100KB — well within stdin-pipe limits.
- **Direct endpoint path expansion**: `~/.orbion/config.json` needs to be expanded for the local user. The Node.js `os.homedir()` is used for direct endpoints. For SSH, the remote shell expands `~` natively. → *Mitigation*: Different path resolution for each transport.
