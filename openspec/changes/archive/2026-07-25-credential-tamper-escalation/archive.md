# Archive: credential-tamper-escalation

- **Change ID:** credential-tamper-escalation
- **Issue:** #338
- **Archived:** 2026-07-25

## Summary

Escalate `CredentialTamperedError` instead of silently degrading to "blocked" auth state.

## What changed

- `EnvironmentAuthState` now includes `"tampered"` — distinct from `"blocked"`
- `getSessionToken` / `getSshKeyPassphrase` set authState to `"tampered"` on HMAC failure, not `"blocked"`
- `onCredentialTampered` callback dispatches OS notification + security audit log entry
- `credential:tampered` IPC sent to renderer for UI update
- `SecurityAuditEvent` type + `CredentialBridge` added to shared IPC contract
- Renderer `InstanceSettingsPanel` renders tampered state with i18n security warning
- Separate `security-audit-log` electron-store persists tampering events for forensics

## Verification

- 19/19 credential-vault tests pass
- `pnpm typecheck` — zero errors
- `pnpm check:comments` — all files ≤ 10%
