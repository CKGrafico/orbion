# Design: SSH loop-task onboarding

## Context

The add-machine wizard already owns SSH probing, Node installation, remote tool installation, daemon startup, and environment persistence. loop-task was previously installed as an implicit mandatory part of the broader service launch, so the user could not clearly see or approve fresh-machine installation and startup failures could be reported before the daemon was actually ready.

## Decisions

### Distinguish command presence from daemon state

`VmWizardProbeResult` reports `loopTaskFound` separately from `daemonRunning` and `daemonPort`. The SSH probe checks `command -v loop-task`, then retains process and port detection. A running daemon also counts as evidence that loop-task is available.

### Require Node 20 before loop-task installation

The existing Node probe and mise upgrade flow remains the gate. Its minimum version becomes 20.0.0, matching the onboarding requirement and project runtime.

### Use a dedicated consent checkpoint

After SSH access and Node validation, a missing loop-task command moves the wizard to `loop-task-consent`. The existing consent bridge carries the install or skip response, so no new IPC channel is needed. Accepting calls the existing pinned npm launch path with optional tools disabled, which installs loop-task and starts the daemon before the wizard continues.

### Verify startup before reporting success

The remote launch script starts loop-task on `127.0.0.1`, then performs a bounded readiness loop. It prefers the loopback HTTP API and falls back to local listening-port tools while checking that the process remains alive. Failure emits a stable marker, prints the daemon log, and exits nonzero.

### Preserve remote diagnostics

`launchOnVm` combines bounded stdout, stderr, and relevant remote log tails into `logTail`. The renderer displays this output on the error state and leaves Retry and Cancel actions available.

## Security

- Installation and daemon startup execute only in the Electron main process over the validated SSH target.
- The daemon remains bound to loopback.
- Package installation uses the existing pinned npm command generation.
- Local/direct instances never enter the install flow.

## Verification

Focused tests cover command detection, Node 20 enforcement, consent, install/start orchestration, cancellation, diagnostics, retry readiness, existing installations, local-path exclusion, and startup-readiness failure.
