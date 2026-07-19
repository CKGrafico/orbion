# Provision the chosen agent runtime on the VM from the wizard

## Summary

After the user picks an agent runtime (OpenCode or Claude Code) in the Add VM wizard, the wizard should check whether that runtime is available on the target instance, offer to install/start it with visible progress, surface real error output on failure, and store the result as the instance's runtime state.

## Motivation

Currently, the wizard stores `agentRuntime` as a preference but does not verify or provision the chosen runtime. A user who picks "Claude Code" on a VM that only has OpenCode will have a broken chat experience with no feedback. The issue asks for a closed-loop flow: detect, offer, install, confirm, persist.

## Acceptance Criteria

1. After the runtime choice step, the wizard checks availability of the chosen runtime on the instance (via SSH probe for SSH targets; via health check for local/direct targets).
2. If the runtime is missing, the wizard offers to install/start it with visible progress and real error output on failure.
3. The result (available / unavailable + reason) is stored as the instance's runtime state on the `Environment` object.
4. Runtime interaction is kept behind a small adapter so OpenCode and Claude Code specifics stay isolated.

## Design Decisions

### Runtime adapter pattern

Introduce a `runtime-adapter.ts` module in `src/main/` that encapsulates runtime-specific logic (how to detect, install, and start each runtime). The wizard calls the adapter; it does not contain `if (runtime === "opencode")` branches inline.

### Runtime state on Environment

Add `runtimeState` to the `Environment` type in `ipc.ts`:

```ts
type RuntimeState = "available" | "unavailable" | "unknown";
interface Environment {
  // ...existing fields...
  runtimeState?: RuntimeState;
}
```

The wizard sets this after provisioning. "unknown" is the default for pre-existing environments and local/direct environments where SSH-based detection isn't possible.

### Wizard flow extension

After the existing "pick-services" step (which already defaults the chosen runtime tool for installation), add a dedicated "runtime-provision" step that:

1. After service selection, runs the runtime adapter's `detectRuntime()` to check if the chosen runtime binary/service is reachable.
2. If not found, emits a "runtime-consent" step asking the user to install.
3. If the user consents, emits "installing" progress while the adapter installs/starts the runtime.
4. On success or failure, updates `runtimeState` on the environment.

For local/direct environments, detection is limited to checking the OpenCode server endpoint (already present via `OpenCodeService`). If the user chose Claude Code on a local env, we mark runtime as "unknown" since we cannot SSH-probe.

### SSH path: reuse existing probe and launch

The SSH probe already detects `opencode` binary via TOOL_DEFINITIONS. The launch script already installs and starts `opencode serve`. We extend the adapter to also handle `claude` (Claude Code CLI) detection and installation via the existing npm-strategy tool definition.

### Local/direct path

For local environments, after the daemon URL is validated, we check if the OpenCode server is reachable (already done by the existing `OpenCodeService` check). The `runtimeState` is set to "available" if the chosen runtime's endpoint responds, "unknown" otherwise.

## What is NOT in scope

- Retrying runtime provisioning outside the wizard (that is a separate concern for the connection supervisor).
- Runtime switching after the wizard completes (user can re-add or modify the environment).
- Claude Code server endpoint detection (Claude Code does not expose an HTTP health endpoint like OpenCode's `serve` mode; detection is CLI-only via SSH).
