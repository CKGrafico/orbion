## Why

OpenCode passwords are stored in plaintext in `config.json` when Electron's `safeStorage` is unavailable (common on Linux without `libsecret`). The `encryptValue()` function returns `null`, and `_setOpenCodeEndpoint()` falls through to storing the raw password. Additionally, `makeClient()` in `opencode-client.ts` silently falls back to treating the raw string as a password when decryption fails. No warning is shown to the user. This is a security vulnerability (severity 7/10) — any process with read access to `userData` can extract the password.

## What Changes

- **Reject password storage** when `safeStorage.isEncryptionAvailable()` returns `false`. The `setOpenCodeEndpoint` IPC handler will return an error result instead of silently storing plaintext.
- Add a `wasEncrypted` boolean flag to `OpenCodeEndpoint` so `decryptValue` in `makeClient()` can distinguish between "was encrypted but decryption failed" (treat as error) vs "was never encrypted" (legacy migration path).
- Return a structured error from the IPC handler when encryption is unavailable, so the renderer can display a user-facing warning: "Password storage requires a keychain. Install libsecret on Linux."
- **BREAKING**: `setOpenCodeEndpoint` IPC return type changes from `void` to `SetOpenCodeEndpointResult` (success | error). The IPC contract change is internal (main→renderer), not a public API break.

## Capabilities

### New Capabilities
- `encrypted-password-guard`: Rejects password persistence when OS keychain is unavailable; surfaces structured error to renderer for user notification.

### Modified Capabilities

## Impact

- **`src/shared/ipc.ts`**: `OpenCodeEndpoint` type gains `wasEncrypted` field; `ConfigBridge.setOpenCodeEndpoint` return type changes from `void` to result type.
- **`src/main/config-store.ts`**: `_setOpenCodeEndpoint()` rejects when encryption unavailable; `setOpenCodeEndpoint()` returns result type.
- **`src/main/opencode-client.ts`**: `makeClient()` uses `wasEncrypted` flag instead of fallback-to-raw heuristic.
- **`src/main/index.ts`**: IPC handler returns error result; sends user-facing dialog on encryption-unavailable.
- **`src/main/ipc-validation.ts`**: Validation updated for new `wasEncrypted` field.
- **`src/preload/index.ts`**: Bridge return type update.
- **`src/renderer/`**: `store.ts`, `ConfigService`, `interfaces`, `MockServices` updated for new return type.
