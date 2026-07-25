# Tasks: credential-tamper-escalation

- [x] 1.1 Add `"tampered"` to `EnvironmentAuthState` union in `src/shared/ipc.ts` <!-- agent: general.build, depends_on: [], touches: [src/shared/ipc.ts] -->
- [x] 1.2 Create `src/main/security-audit-log.ts` with `logSecurityEvent()` and `getSecurityAuditEvents()` <!-- agent: general.build, depends_on: [], touches: [src/main/security-audit-log.ts] -->
- [x] 2.1 Add `onCredentialTampered` callback and `setCredentialTamperedCallback()` to `src/main/config-store.ts`; change both `CredentialTamperedError` catch blocks to set authState `"tampered"` and invoke callback <!-- agent: general.build, depends_on: [1.1, 1.2], touches: [src/main/config-store.ts] -->
- [x] 2.2 Wire `setCredentialTamperedCallback` in `src/main/index.ts` to dispatch NotificationService notification, log security event, and send `credential:tampered` IPC to renderer <!-- agent: general.build, depends_on: [1.2, 2.1], touches: [src/main/index.ts] -->
- [x] 3.1 Update `src/renderer/src/components/InstanceSettingsPanel.tsx` to handle `"tampered"` authState with security warning label <!-- agent: general.build, depends_on: [1.1], touches: [src/renderer/src/components/InstanceSettingsPanel.tsx] -->
- [x] 3.2 Add i18n keys for tampered state to `src/renderer/src/i18n/en.json` <!-- agent: general.build, depends_on: [], touches: [src/renderer/src/i18n/en.json] -->
- [x] 4.1 Update `tests/credential-vault.test.ts` to assert `"tampered"` authState and verify callback is invoked <!-- agent: general.build, depends_on: [2.1], touches: [tests/credential-vault.test.ts] -->
- [x] 5.1 Run `pnpm typecheck` and `pnpm check:comments` — fix any failures <!-- agent: general.build, depends_on: [4.1], touches: [] -->
