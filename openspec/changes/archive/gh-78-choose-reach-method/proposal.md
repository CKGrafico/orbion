# Add-instance wizard: choose reach method (local / SSH)

**Change ID:** gh-78-choose-reach-method
**Issue:** #78

## Problem

The add-instance wizard only supports the SSH flow. Users with a locally-reachable daemon (e.g. on localhost or a private network) must still enter an SSH target, even though they could simply provide the daemon URL. The wizard needs a step that lets users choose how Orbion reaches the machine.

## Solution

1. **Add a reach-method chooser step** at the top of the wizard form, before any target input. Two card-style options:
   - **Local / already reachable** — enter the daemon API URL directly (e.g. `http://localhost:8845`)
   - **SSH** — connect to a remote VM over SSH (existing `user@host` flow)

2. **Local path**: validates URL format and daemon reachability (health check) before persisting. Creates an environment with `AccessEndpoint.kind = "direct"`, no `sshTarget`.

3. **SSH path**: validates the SSH session before allowing Next (existing probe flow). Creates an environment with `AccessEndpoint.kind = "ssh"`, `sshTarget` = host label.

4. **Persistence**: the chosen reach method is stored as the endpoint kind on the `AccessEndpoint` record, distinguishing the two paths at runtime.

5. **Mock adapter**: `MockVmWizardService.startWizard()` updated to accept the new parameters for browser-only dev.

## Acceptance Criteria

- [x] Wizard step offers "Local / already reachable" (enter API URL) and "SSH" (host, user, port, key selection)
- [x] On SSH selection the wizard validates it can open a session before allowing Next
- [x] On Local selection the wizard validates URL format and daemon reachability before allowing Next
- [x] Chosen reach method is persisted with the instance record

## Affected Files

- `src/shared/ipc.ts` — `ReachMethod` type, `pick-reach-method` step, `VmWizardProgress.reachMethod`, `VmWizardBridge.startWizard` signature
- `src/main/vm-wizard.ts` — `runLocalWizard()` path, `runWizard()` dispatch by reach method
- `src/main/index.ts` — IPC handler for `vmWizard:start` with new params
- `src/preload/index.ts` — bridge `startWizard` with `reachMethod` and `directUrl`
- `src/renderer/src/components/AddVmWizard.tsx` — reach-method chooser UI, conditional fields
- `src/renderer/src/i18n/en.json` — i18n strings for reach-method step
- `src/renderer/src/services/interfaces.ts` — `IVmWizardService.startWizard` signature
- `src/renderer/src/services/impl/VmWizardService.ts` — implementation pass-through
- `src/renderer/src/services/mock/MockServices.ts` — mock adapter updated
