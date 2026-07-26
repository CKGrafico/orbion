## Why

The credential vault logs cleartext reference UUIDs on integrity check failures (line 87, 93) and orphan pruning (line 124) in `src/main/credential-vault.ts`. This violates the principle that credential metadata must never appear in logs. Anyone with access to both the log file and `credentials.json` can correlate which credentials were checked or tampered. The migration path logs at `info` level, appearing in production logs by default.

## What Changes

- Remove the `reference` argument from the `logger.info` call at line 87 (migration path).
- Remove the `reference` argument from the `logger.error` call at line 93 (integrity failure path).
- Remove the `orphans` array argument from the `logger.warn` call at line 124 (pruning path), keeping only the count.
- `CredentialTamperedError` already carries the `reference` for programmatic handling — no functional change.

## Capabilities

### New Capabilities

(None)

### Modified Capabilities

- `environment-credential-vault`: Credential metadata (reference UUIDs, orphan key arrays) must not appear in log output. Adds a log-redaction requirement to the existing vault specification.

## Impact

- `src/main/credential-vault.ts`: 3 log-call changes (no API or behavioral change).
- No IPC, renderer, or config-store impact.
- Existing tests do not assert on logger output — no test changes needed.
