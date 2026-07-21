# Credential Vault Integrity Verification

## Summary

`credential-vault.ts` stores `safeStorage`-encrypted credentials as bare base64 with no HMAC, integrity tag, or authenticated encryption. When `getCredential()` decrypts a tampered or corrupted value, `safeStorage.decryptString()` either throws (silently caught, returns `null`) or returns garbage. No audit log, no tamper detection, no alert.

An attacker with write access to `credentials.json` can swap credential references between environments, roll back to previous ciphertext, or corrupt entries undetected.

## Score: 7/10

- Impact: 3/4 (credential swap between environments, silent rollback, no detection)
- Likelihood: 2/3 (requires write access to userData directory, which malware or a malicious npm postinstall script could obtain)
- Fix leverage: 2/3 (straightforward to add HMAC, but needs migration for existing entries)

## Proposed Fix

1. Add HMAC-SHA256 over `(reference + encryptedValue)` keyed by a vault-specific key derived from a machine-bound secret stored via `safeStorage`. Store `{ encryptedValue, hmac }` per credential.
2. In `getCredential()`, verify HMAC before decrypting. On mismatch:
   - Log a `logger.error` with the reference for structured alerting
   - Throw a typed `CredentialTamperedError` so callers can alert the user and invalidate the session rather than silently returning null
3. Migration: on first read of entries without HMAC, compute and store HMAC. Log a one-time info warning.
4. Update `config-store.ts` consumers (`getSessionToken`, `getSshKeyPassphrase`) to catch `CredentialTamperedError` and set environment auth state to `"blocked"`.

## Files

- `src/main/credential-vault.ts` — `storeCredential()`, `getCredential()`, `removeCredential()`
- `src/main/config-store.ts` — consumers of `getCredential()`
- `tests/credential-vault.test.ts` — new tests for HMAC, tamper detection, migration

## References

- GitHub Issue #305
