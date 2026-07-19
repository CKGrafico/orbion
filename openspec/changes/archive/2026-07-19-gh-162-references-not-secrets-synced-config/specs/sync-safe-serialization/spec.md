# sync-safe-serialization Specification

## Purpose
Ensure the serialization layer structurally prevents secret fields from appearing in synced config output, so a config leak reveals shape, not access.

## Requirements

### Requirement: Serialization uses allowlists, not blocklists
The function that produces serialized/synced environment data SHALL use explicit field allowlists at every nesting level (environment, endpoint, credentialRefs, OpenCode endpoint). Fields not on the allowlist SHALL be silently dropped.

#### Scenario: A new internal field is added to EnvironmentWithFingerprint
- **WHEN** a developer adds a new field to `EnvironmentWithFingerprint` that is not in `SAFE_ENVIRONMENT_KEYS`
- **THEN** the new field is excluded from serialized output without any code change to the serialization function

#### Scenario: A secret field is accidentally placed on an environment object
- **WHEN** a field named `password`, `wasEncrypted`, `encryptedAccessToken`, `encryptedValue`, or `accessToken` exists on any nested object
- **THEN** it is excluded from serialized output because it is not on the corresponding allowlist

### Requirement: Known-secret field names must never appear in serialized output
The canonical list of secret field names (`SECRET_FIELD_NAMES`) SHALL be documented and tested. A test SHALL assert that none of these field names appear as JSON keys in the output of `getEnvironmentsForRenderer()`.

#### Scenario: Full environment with all credential types is serialized
- **WHEN** an environment has stored session tokens, SSH key passphrases, and OpenCode endpoint passwords
- **THEN** the serialized JSON contains no key named `password`, `wasEncrypted`, `encryptedAccessToken`, `encryptedValue`, or `accessToken`
- **AND** the serialized JSON contains no actual secret value (token strings, passphrases, ciphertext)

### Requirement: OpenCode endpoints serialize only the URL
The `opencode` and `infraOpenCode` endpoint fields on an environment SHALL serialize only the `url` field. The `password` field (whether plaintext or encrypted) and `wasEncrypted` metadata SHALL be excluded.

#### Scenario: Environment with OpenCode endpoint containing encrypted password
- **WHEN** an environment has `opencode: { url, password: <encrypted>, wasEncrypted: true }`
- **THEN** the serialized output contains `opencode: { url }` with no `password` or `wasEncrypted` keys

### Requirement: Credential references are opaque identifiers
The `credentialRefs` object SHALL contain only opaque reference identifiers (UUIDs). No credential values or ciphertext SHALL appear.

#### Scenario: Environment with stored session token and SSH passphrase
- **WHEN** an environment has credential refs for both session token and SSH key passphrase
- **THEN** the serialized `credentialRefs` contains `sessionToken` and `sshKeyPassphrase` keys with UUID values
- **AND** the UUID values can be used only by the main process to resolve actual credentials from the vault
