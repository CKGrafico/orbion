# Fix: Plaintext Password Storage in Infra OpenCode Endpoint

**Change ID:** fix-49-plaintext-password-security  
**Severity:** Critical (9.0/10)  
**Issue:** #49

## Problem

`_setInfraOpenCodeEndpoint()` in `config-store.ts` silently stores the OpenCode password **in plaintext** in `config.json` on disk when `safeStorage.isEncryptionAvailable()` returns false. The sibling function `_setOpenCodeEndpoint()` correctly **refuses** to store the password in this case. This inconsistency means the infra OpenCode password can end up stored unencrypted on disk, readable by any process with file access.

Additionally:
- The `wasEncrypted` field on `OpenCodeEndpoint` leaks main-process encryption state to the renderer via IPC
- The password is passed as plaintext through the IPC bridge

## Affected Files

- `src/main/config-store.ts` (lines 323-342) - plaintext storage in `_setInfraOpenCodeEndpoint`
- `src/shared/ipc.ts` (lines 182-187) - `wasEncrypted` field in IPC type
- `src/preload/index.ts` - password passed through contextBridge
- `src/renderer/src/types.ts` - mirrors the IPC `wasEncrypted` field

## Fix Strategy

1. **Make `_setInfraOpenCodeEndpoint` consistent with `_setOpenCodeEndpoint`** - refuse to store when encryption is unavailable, return `SetOpenCodeEndpointResult` 
2. **Strip `wasEncrypted` from the IPC `OpenCodeEndpoint` type** - internal-only metadata that should not cross the IPC boundary
3. **Strip `wasEncrypted` from environment data sent to renderer** via `getEnvironments()`
4. **Wire up the IPC handler** for `config:setInfraOpenCodeEndpoint` with dialog on encryption failure (matching the existing `config:setOpenCodeEndpoint` pattern)
5. **Add `setInfraOpenCodeEndpoint` to the `ConfigBridge` interface** and preload bridge so renderer can call it with result handling

## Risk

Low-risk change: tightens security posture by aligning two code paths that should have identical behavior. No functional regression - the only behavior change is that passwords will no longer be stored in plaintext when encryption is unavailable (which matches user expectation and the other code path).
