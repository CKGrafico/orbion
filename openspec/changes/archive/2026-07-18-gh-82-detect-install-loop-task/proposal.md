# Detect and install loop-task during SSH onboarding

## Change ID
gh-82-detect-install-loop-task

## Summary
After Orbion validates SSH access to a machine, the add-machine wizard detects whether loop-task is installed and whether its daemon is running. A fresh machine gets an explicit one-click install-and-start offer. Installation failures retain the remote command output so the user can diagnose the problem, retry, or cancel without an environment being saved prematurely.

## Problem
The SSH wizard currently treats loop-task as an implicit mandatory service. It checks for a running process, but it does not clearly distinguish an installed command from a running daemon, does not present a focused install offer immediately after reachability validation, accepts Node 18 even though loop-task onboarding requires Node 20 or newer, and can replace useful installer output with a generic failure message.

## Solution
- Extend the SSH probe result to report whether the `loop-task` command is present, while retaining daemon and port detection.
- Enforce Node 20 or newer before attempting the loop-task install.
- Add a dedicated loop-task consent state after SSH validation. If loop-task is missing, the primary action installs the pinned npm package globally and starts the daemon on loopback.
- Keep local/direct onboarding unchanged and user-managed.
- Preserve stdout, stderr, and relevant remote logs when installation or startup fails.
- Keep the wizard open on failure with explicit retry and cancel actions.
- Add focused Vitest coverage for detection, install/start orchestration, failure diagnostics, and local-path exclusion.

## Acceptance criteria mapping
- After SSH reach is validated, the wizard checks the loop-task command and running daemon state.
- A missing loop-task command produces a one-click install-and-start offer using the existing pinned global npm install path on Node 20 or newer.
- Installation and daemon startup remain bound to loopback and use the existing SSH execution boundary.
- Failure displays the actual remote output and leaves retry and cancel available.
- Local instances never enter the installation flow.

## Scope
- `src/shared/ipc.ts`
- `src/main/ssh-probe.ts`
- `src/main/ssh-launch.ts`
- `src/main/vm-wizard.ts`
- `src/renderer/src/components/AddVmWizard.tsx`
- `src/renderer/src/i18n/en.json`
- focused tests under `tests/`
