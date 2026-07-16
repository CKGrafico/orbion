# Proposal: Enable renderer sandbox in BrowserWindow webPreferences

**Change ID:** gh-37-sandbox-security-webpreferences
**Source:** GitHub Issue #37
**Severity:** 8.5/10 (Security)

## Problem

`src/main/index.ts` line 339 sets `sandbox: false` in `webPreferences` for the main `BrowserWindow`. This weakens the security boundary between the renderer process and the system, even though `contextIsolation: true` and `nodeIntegration: false` are correctly configured.

When `sandbox: false`:
- The preload script runs with full Node.js access, not just the sandboxed `contextBridge` API. A compromised preload dependency could gain unrestricted `require()`, `fs`, `child_process` access.
- The renderer process (if a sandbox escape occurs via a browser engine vulnerability) has a larger attack surface through the preload bridge.
- Electron's site isolation is less effective, making the app vulnerable to Spectre-class side-channel attacks.

This is especially critical for Orbion, which handles SSH keys, session tokens, and encrypted credentials via `safeStorage`. A sandbox escape could expose decrypted session tokens, SSH identity file paths, and OpenCode passwords.

## Analysis

The preload script (`src/preload/index.ts`) only uses `contextBridge` and `ipcRenderer` from Electron. Both are fully available in sandboxed preload scripts. No Node.js APIs are used. There is no blocker to enabling the sandbox.

## Solution

1. Change `sandbox: false` to `sandbox: true` in `src/main/index.ts` `createWindow()` function.
2. Verify the preload script is sandbox-compatible (already confirmed: no Node.js usage).
3. Run typecheck to validate no regressions.

## Impact

- **Files changed:** 1 (`src/main/index.ts`)
- **Lines changed:** 1 (value change only)
- **Risk:** Minimal. The preload script uses only Electron APIs available in sandboxed mode. No behavior change in the renderer.
- **Security gain:** Full renderer process sandboxing, mitigating sandbox escape and Spectre-class attacks.
