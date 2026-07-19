## Why

The serialization layer that produces synced config for IPC/renderer uses a blocklist approach: it manually strips fields like `password` and `wasEncrypted` from environment data. If a new secret field is added to the internal types and the blocklist is not updated, the secret leaks into serialized output. A leak of the config JSON reveals the shape of credentials (password, access tokens, encrypted ciphertext), not just references.

## What Changes

- Replace the blocklist-style `sanitizeEndpoint` and manual field-stripping in `getEnvironmentsForRenderer()` with a structural allowlist approach (`sanitizeEnvironmentForSync`) that enumerates safe fields at every nesting level.
- Add a `SECRET_FIELD_NAMES` constant documenting all known secret fields that must never appear in serialized output.
- Add per-level allowlists (`SAFE_ENVIRONMENT_KEYS`, `SAFE_ENDPOINT_KEYS`, `SAFE_CREDENTIAL_REF_KEYS`, `SAFE_OPENCODE_ENDPOINT_KEYS`) that explicitly enumerate which fields are safe to serialize.
- Add `findSecretFieldInJson()` helper for test assertions.
- Add comprehensive tests asserting no known-secret field appears in serialized output.

## Capabilities

### New Capabilities
- `sync-safe-serialization`: The serialization layer structurally excludes secret fields using allowlists, making it impossible for credential material to leak into synced config even if new fields are added to internal types.

### Modified Capabilities
- `environment-credential-vault`: The sanitization implementation changes from blocklist to allowlist, but the behavioral contract (config stores references, never secrets) is unchanged.

## Impact

The change affects `src/main/config-store.ts` (serialization logic) and `tests/credential-vault.test.ts` (5 new tests). No IPC contract changes, no new dependencies, no renderer changes, no build changes.
