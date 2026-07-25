# Proposal: Silent credential tampering: escalate CredentialTamperedError instead of silent degradation

- **Change ID:** credential-tamper-escalation
- **Issue:** #338
- **Scope:** standard

## Problem

When the HMAC integrity check in `getCredential()` detects tampering, it throws `CredentialTamperedError`. Callers in `config-store.ts` catch this error and silently degrade:

- `getSessionToken()`: catches error, sets auth state to `"blocked"`, returns `null`
- `getSshKeyPassphrase()`: catches error, sets auth state to `"blocked"`, returns `null`

The user sees only a generic "blocked" status — no indication that credentials were tampered with. Credential tampering is a high-severity security event that should escalate prominently, not silently degrade.

## Solution

1. Add `"tampered"` as a new `EnvironmentAuthState` value distinct from `"blocked"`
2. Change the `CredentialTamperedError` catch blocks to set auth state to `"tampered"` instead of `"blocked"`
3. Add a `security-audit-log` module that writes tampering events to a separate persistent store for forensic purposes
4. Add a `onCredentialTampered` callback hook in `config-store.ts` so the main process can dispatch OS notifications without coupling config-store to NotificationService
5. Wire the hook in `index.ts` to send an OS notification via NotificationService
6. Update the renderer `InstanceSettingsPanel` to render `"tampered"` auth state with a security warning label
7. Add i18n keys for the tampered state
8. Update tests to assert `"tampered"` state and notification dispatch

## Files affected

- `src/shared/ipc.ts` — add `"tampered"` to `EnvironmentAuthState` union
- `src/main/config-store.ts` — change blocked→tampered, add callback hook
- `src/main/security-audit-log.ts` — new: persistent security event store
- `src/main/index.ts` — wire onCredentialTampered to NotificationService + security audit log
- `src/renderer/src/components/InstanceSettingsPanel.tsx` — render tampered state
- `src/renderer/src/i18n/en.json` — add i18n keys
- `tests/credential-vault.test.ts` — update assertions from blocked→tampered, add notification test

## Risks

- `"tampered"` is a new auth state value: any code that switches on `EnvironmentAuthState` must handle it. Current switch statements use `default` fallback so they degrade gracefully.
- The security audit log uses a separate electron-store file — no GDPR/retention concern beyond what the app already stores.
