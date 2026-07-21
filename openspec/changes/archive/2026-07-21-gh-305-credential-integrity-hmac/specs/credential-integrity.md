# Credential Integrity Spec

## HMAC-SHA256 Integrity

Each credential record stores `{ encryptedValue, hmac }` where `hmac` is a base64-encoded HMAC-SHA256 of `reference + ":" + encryptedValue`, keyed by a vault key.

## Vault Key Derivation

The vault key is a 32-byte random key generated once and stored encrypted via `safeStorage` in an electron-store named `credential-vault-key`. The key is stored as `{ encryptedKey: string }` where `encryptedKey` is `safeStorage.encryptString(hexKey).toString("base64")`. On first use, if no key exists, one is generated and persisted.

## CredentialTamperedError

A custom error class exported from `credential-vault.ts`. Thrown by `getCredential()` when HMAC verification fails. Carries the `reference` string for logging and caller handling.

## Migration

When `getCredential()` reads a record with no `hmac` field:
1. Compute HMAC over `reference + ":" + record.encryptedValue` using the vault key
2. Write `{ encryptedValue, hmac }` back to the credential store
3. Log a one-time info: "Credential entry migrated to include integrity check"
4. Proceed with decryption as normal

When `storeCredential()` writes a new record, it always includes `hmac`.

## Consumer Changes

`getSessionToken()` and `getSshKeyPassphrase()` in `config-store.ts`:
- Catch `CredentialTamperedError` from `getCredential()`
- Log the error at error level
- Set environment auth state to `"blocked"`
- Return `null` to the caller

## Backward Compatibility

- Old-format records (no HMAC) are transparently migrated on first read
- No user action required; migration is automatic
- `SECRET_FIELD_NAMES` in `config-store.ts` gains `"hmac"` to prevent leakage in sync output
