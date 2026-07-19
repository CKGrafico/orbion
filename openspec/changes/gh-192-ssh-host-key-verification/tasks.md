# Tasks: SSH Host Key Verification

## Summary
- **Change:** gh-192-ssh-host-key-verification
- **Total tasks:** 8
- **Agents:** frontend-engineer (build + fast)

---

## Tasks

- [ ] 1.1 Add known_hosts helpers to ssh-config.ts (isHostInKnownHosts, appendToKnownHosts, fetchHostKey, knownHostsPath) and remove StrictHostKeyChecking=accept-new from buildSshArgs <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/ssh-config.ts] -->

- [ ] 1.2 Remove StrictHostKeyChecking=accept-new from ssh-tunnel.ts openTunnel() <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/ssh-tunnel.ts] -->

- [ ] 2.1 Add host-key-verify step type and progress fields to VmWizardStep, VmWizardProgress, and VmWizardBridge in ipc.ts; add respondHostKey to VmWizardBridge <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/shared/ipc.ts] -->

- [ ] 2.2 Add vmWizard:respondHostKey IPC channel in index.ts, preload/index.ts, and ipc-validation.ts <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/main/index.ts, src/preload/index.ts, src/main/ipc-validation.ts] -->

- [ ] 3.1 Implement host-key-verify step in vm-wizard.ts (check known_hosts, fetch keyscan, emit progress, resolve acceptance) and wire respondHostKey <!-- agent: frontend-engineer.build, depends_on: [2.2, 1.1], touches: [src/main/vm-wizard.ts] -->

- [ ] 3.2 Add host-key verification UI panel to AddVmWizard.tsx and wire respondHostKey in VmWizardService.ts and interfaces <!-- agent: frontend-engineer.build, depends_on: [2.2, 3.1], touches: [src/renderer/src/components/AddVmWizard.tsx, src/renderer/src/services/impl/VmWizardService.ts, src/renderer/src/services/interfaces.ts] -->

- [ ] 3.3 Add i18n keys for host key verification step (vmWizard.stepHostKeyVerify, vmWizard.hostKeyFingerprint, vmWizard.hostKeyVerifyDescription, vmWizard.trustHost, vmWizard.hostKeyRejected) <!-- agent: frontend-engineer.fast, depends_on: [3.2], touches: [src/renderer/src/i18n/en.ts] -->

- [ ] 4.1 Add Vitest unit tests for isHostInKnownHosts, appendToKnownHosts, fetchHostKey, and the updated buildSshArgs (no accept-new) <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [tests/ssh-validation.test.ts] -->

- [ ] 4.2 Run pnpm typecheck and fix any errors <!-- agent: frontend-engineer.fast, depends_on: [3.3, 4.1], touches: [] -->
