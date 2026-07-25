# Spec: credential-tamper-escalation

## 1. New auth state: tampered

Add `"tampered"` to the `EnvironmentAuthState` union in `src/shared/ipc.ts`:

```ts
export type EnvironmentAuthState = "unauthenticated" | "paired" | "blocked" | "tampered" | "unknown";
```

Semantics: `"tampered"` means HMAC integrity verification detected that stored credentials were modified on disk. This is distinct from `"blocked"` which means a session expired or was revoked normally.

## 2. config-store callback hook

Add a module-level callback variable in `config-store.ts`:

```ts
let onCredentialTampered: ((environmentId: string, credentialKind: "sessionToken" | "sshKeyPassphrase") => void) | null = null;

export function setCredentialTamperedCallback(cb: (environmentId: string, credentialKind: "sessionToken" | "sshKeyPassphrase") => void): void {
  onCredentialTampered = cb;
}
```

When `CredentialTamperedError` is caught, both `getSessionToken()` and `getSshKeyPassphrase()` call `onCredentialTampered?.(environmentId, kind)` and set auth state to `"tampered"` instead of `"blocked"`.

## 3. Security audit log

New file `src/main/security-audit-log.ts`:

- Persistent `electron-store` named `security-audit-log`
- Schema: `{ events: SecurityAuditEvent[] }` where each event has `{ id, timestamp, kind, environmentId, credentialKind, detail }`
- Export `logSecurityEvent(event)` that appends to the store and truncates to the last 100 entries
- Export `getSecurityAuditEvents()` for potential future renderer access

## 4. Notification dispatch

In `index.ts`, after creating `notificationService`, call `setCredentialTamperedCallback()` with a handler that:

1. Calls `logSecurityEvent()` with kind `"credential-tampered"`
2. Looks up the environment name
3. Calls `notificationService.send()` with a security alert title/body, `suppressIfFocused: false`
4. Sends an IPC event `credential:tampered` to the renderer with `{ environmentId, credentialKind }`

## 5. Renderer updates

- `InstanceSettingsPanel.tsx`: add `case "tampered"` to `authStateLabel()` returning a security warning i18n key
- `en.json`: add `instanceSettings.authStateTampered` = "Credential tampered — security alert"
