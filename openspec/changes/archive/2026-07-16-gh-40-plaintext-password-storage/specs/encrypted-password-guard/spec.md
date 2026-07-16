## ADDED Requirements

### Requirement: Reject password storage when OS keychain is unavailable

When `safeStorage.isEncryptionAvailable()` returns `false`, the system MUST NOT store an OpenCode endpoint password in plaintext. Instead, it MUST return a structured error indicating encryption is unavailable.

#### Scenario: User saves endpoint with password on Linux without libsecret
- **WHEN** `safeStorage.isEncryptionAvailable()` returns `false` and `setOpenCodeEndpoint` is called with a non-null password
- **THEN** the endpoint is NOT persisted, and the IPC handler returns `{ ok: false, reason: "encryption-unavailable" }`

#### Scenario: User saves endpoint without password on any OS
- **WHEN** `setOpenCodeEndpoint` is called with `password: null`
- **THEN** the endpoint is stored normally regardless of safeStorage availability, and the result is `{ ok: true }`

#### Scenario: User saves endpoint with password on OS with keychain
- **WHEN** `safeStorage.isEncryptionAvailable()` returns `true` and `setOpenCodeEndpoint` is called with a non-null password
- **THEN** the password is encrypted via `safeStorage.encryptString()`, stored with `wasEncrypted: true`, and the result is `{ ok: true }`

### Requirement: `wasEncrypted` flag on OpenCodeEndpoint

The `OpenCodeEndpoint` interface MUST include a `wasEncrypted?: boolean` field. When a password is stored after successful encryption, `wasEncrypted` is set to `true`. For existing entries without this field, it is treated as `false`.

#### Scenario: Newly stored endpoint with encrypted password
- **WHEN** a password is encrypted and stored successfully
- **THEN** `wasEncrypted` is set to `true` on the stored `OpenCodeEndpoint`

#### Scenario: Legacy endpoint without wasEncrypted field
- **WHEN** an existing `OpenCodeEndpoint` in config.json does not have a `wasEncrypted` field
- **THEN** the system treats it as `wasEncrypted: false` and uses the raw password string for authentication

### Requirement: Safe decryption in makeClient

The `makeClient()` function MUST use the `wasEncrypted` flag to determine decryption behavior, not a silent fallback.

#### Scenario: Encrypted password fails to decrypt
- **WHEN** `endpoint.wasEncrypted === true` and `decryptValue()` returns `null`
- **THEN** the client MUST NOT fall back to using the raw string as a password; authentication will simply fail with an appropriate error

#### Scenario: Legacy plaintext password
- **WHEN** `endpoint.wasEncrypted === false` or `undefined` and `endpoint.password` is a non-null string
- **THEN** the raw password string is used as-is for authentication (backward compatibility)

### Requirement: User-facing notification on encryption failure

When password storage is rejected due to unavailable encryption, the user MUST be notified.

#### Scenario: Encryption-unavailable error from IPC
- **WHEN** `setOpenCodeEndpoint` returns `{ ok: false, reason: "encryption-unavailable" }`
- **THEN** a dialog is shown to the user with the message: "Password storage requires a keychain. Install libsecret on Linux or ensure a keychain is available on your system."
