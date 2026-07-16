## Context

Orbion is an Electron desktop app. OpenCode server endpoints are stored per-environment in `electron-store`'s `config.json` (inside `userData`). Passwords are encrypted via Electron's `safeStorage`, which relies on the OS keychain (macOS Keychain, Windows DPAPI, Linux libsecret). On Linux without libsecret/gnome-keyring, `safeStorage.isEncryptionAvailable()` returns `false`, and the current code silently falls through to storing the password in plaintext.

## Goals / Non-Goals

**Goals:**
- Prevent plaintext password storage when the OS keychain is unavailable
- Surface a clear error to the user explaining why password storage failed
- Maintain backward compatibility with existing stored endpoints (passwords that were stored plaintext before this fix should still work for decryption/reading)
- Add `wasEncrypted` flag so the decryption path can distinguish encrypted vs never-encrypted passwords

**Non-Goals:**
- Providing an alternative encryption mechanism (e.g., app-level encryption with a master password) — that would be a separate enhancement
- Migrating already-stored plaintext passwords — they should continue to work via the `wasEncrypted` flag
- Changing the `infraOpenCode` endpoint storage (it currently doesn't store passwords; the `wasEncrypted` requirement applies only to the `opencode` field)

## Decisions

1. **Reject on encryption unavailable**: When `safeStorage.isEncryptionAvailable()` returns `false` and a non-null password is provided, `_setOpenCodeEndpoint()` will not store the endpoint. It will return an error result (`{ ok: false, reason: "encryption-unavailable" }`). This is the safest default — no silent credential leakage.

2. **`wasEncrypted` flag on `OpenCodeEndpoint`**: Add a boolean field `wasEncrypted` to the `OpenCodeEndpoint` interface. When storing, if the password was successfully encrypted, `wasEncrypted` is set to `true`. For existing entries without this field (migration), it defaults to `false`. This lets `makeClient()` distinguish between "was encrypted but failed to decrypt" vs "was never encrypted (legacy plaintext)".

3. **IPC return type change**: `setOpenCodeEndpoint` returns `SetOpenCodeEndpointResult = { ok: true } | { ok: false; reason: "encryption-unavailable" }` instead of `void`. The IPC handler in `main/index.ts` returns this directly. The renderer checks `ok` and shows a dialog on failure.

4. **User-facing dialog in main process**: On encryption-unavailable, the IPC handler shows a `dialog.showMessageBox()` with a clear message before returning the error. This ensures the user is notified even if the renderer doesn't handle the error.

5. **`setOpenCodeEndpoint` without password still works**: When `endpoint.password` is `null`, there's nothing to encrypt — the endpoint is stored normally regardless of `safeStorage` availability.

6. **`makeClient` decryption logic**: If `wasEncrypted` is `true` and `decryptValue` returns `null`, treat this as a fatal error (don't fall back to raw string). If `wasEncrypted` is `false`/`undefined` (legacy), use the raw password string as before.

## Risks / Trade-offs

- **Risk**: Users on Linux without libsecret can no longer save OpenCode endpoints with passwords. **Mitigation**: The error message explicitly tells them to install libsecret. This is the correct security trade-off — it's better to refuse than to silently store credentials in plaintext.
- **Risk**: The `wasEncrypted` field is stored alongside the password. If an attacker modifies `wasEncrypted` from `true` to `false` on a ciphertext blob, `makeClient` would try to use the ciphertext as a password. **Mitigation**: The ciphertext base64 will almost certainly fail authentication, so the practical impact is a failed connection, not a leaked credential. A future enhancement could add a HMAC, but that's out of scope.
- **Trade-off**: The IPC return type changes from `void` to a result object. This requires updating the entire IPC chain (preload, renderer services, store). It's a correct pattern but touches many files.
