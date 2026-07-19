## Tasks

- [x] Replace blocklist `sanitizeEndpoint` and manual field-stripping in `getEnvironmentsForRenderer()` with allowlist-based `sanitizeEnvironmentForSync()`
- [x] Add `SECRET_FIELD_NAMES` constant with canonical list of secret field names
- [x] Add per-level allowlists (`SAFE_ENVIRONMENT_KEYS`, `SAFE_ENDPOINT_KEYS`, `SAFE_CREDENTIAL_REF_KEYS`, `SAFE_OPENCODE_ENDPOINT_KEYS`)
- [x] Add `findSecretFieldInJson()` helper for test assertions
- [x] Add test: no known-secret field appears in serialized output
- [x] Add test: credentialRefs contain only opaque reference UUIDs
- [x] Add test: OpenCode endpoint serializes URL but never password or wasEncrypted
- [x] Add test: plain environment serializes without secrets
- [x] Add test: SECRET_FIELD_NAMES is the canonical list of forbidden fields
- [x] Verify all credential-vault tests pass
