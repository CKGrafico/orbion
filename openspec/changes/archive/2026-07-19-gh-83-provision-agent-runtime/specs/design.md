# Spec: Runtime adapter

## Module: `src/main/runtime-adapter.ts`

A minimal adapter that isolates runtime-specific logic.

```ts
export interface RuntimeAdapter {
  /** Detect if the runtime is available on the VM (via SSH). */
  detect(host: SshHost, runtime: AgentRuntime): Promise<RuntimeDetectResult>;
  /** Install and start the runtime on the VM (via SSH). */
  install(host: SshHost, runtime: AgentRuntime, probe: VmWizardProbeResult): Promise<RuntimeInstallResult>;
}

export interface RuntimeDetectResult {
  available: boolean;
  reason?: string;  // e.g. "binary not found", "service not running"
}

export interface RuntimeInstallResult {
  success: boolean;
  errorDetail?: I18nMessage;
}
```

### OpenCode adapter

- `detect()`: Checks `probe.installedTools.openCode` and whether `opencode serve` is running on the expected port (from probe data).
- `install()`: Delegates to the existing `launchOnVm` with `installTools: { openCode: true }`.

### Claude Code adapter

- `detect()`: Checks `probe.installedTools.claude` (binary presence).
- `install()`: Delegates to the existing `launchOnVm` with `installTools: { claude: true }`.

Both adapters are pure orchestration over existing `ssh-probe` and `ssh-launch` functions. No new SSH scripts are needed.

# Spec: Environment runtime state

## Type changes in `src/shared/ipc.ts`

Add `RuntimeState` type and field on `Environment`:

```ts
export type RuntimeState = "available" | "unavailable" | "unknown";

export interface Environment {
  // ...existing...
  runtimeState?: RuntimeState;
}
```

## Config store changes in `src/main/config-store.ts`

Add a setter for runtime state:

```ts
export function setEnvironmentRuntimeState(environmentId: string, state: RuntimeState): Promise<void>
```

Uses the same `mutateEnvironment` pattern.

# Spec: Wizard flow changes

## New wizard step: `runtime-provision`

Add `"runtime-provision"` to `VmWizardStep` union in `ipc.ts`.

## Step sequence (SSH path)

After the "pick-services" step (where the user confirms service selection and clicks "Continue"), before the main "installing" step:

1. Detect the chosen runtime via `runtimeAdapter.detect()`.
2. If available, skip to normal installing flow, set `runtimeState = "available"`.
3. If not available, emit a `"runtime-consent"` step (new step type) asking the user to install the runtime.
4. If the user declines, set `runtimeState = "unavailable"`, continue to normal installing.
5. If the user accepts, install the runtime as part of the existing "installing" step, then set `runtimeState = "available"` on success or `"unavailable"` on failure.

## Step sequence (local/direct path)

After the daemon URL validation, check the runtime endpoint if applicable:
- If `agentRuntime === "opencode"`, check if the OpenCode server is responding at the configured endpoint. Set `runtimeState` accordingly.
- If `agentRuntime === "claude"`, mark `runtimeState = "unknown"` (cannot verify without SSH).

## Progress events

- `runtime-provision` step: "Checking {runtime} availability..."
- `runtime-consent` step: "{Runtime} was not found on the VM. Install it?"
- During `installing`: existing UI already shows per-tool install progress.

## i18n keys

- `vmWizard.stepRuntimeProvision`
- `vmWizard.stepRuntimeConsent`
- `vmWizard.runtimeNotDetected` ("{runtime} was not detected on the VM.")
- `vmWizard.runtimeConsentPrompt` ("{runtime} was not found on the VM. Install it?")
- `vmWizard.runtimeInstallFailed` ("Failed to install {runtime} on the VM.")

# Spec: Renderer changes

## AddVmWizard.tsx

Add handling for the two new steps:
- `runtime-provision`: Show spinning indicator + "Checking {runtime} availability..."
- `runtime-consent`: Show consent prompt with "Install" / "Skip" buttons (similar to existing consent UI).

## STEP_ORDER update

Insert `"runtime-provision"` and `"runtime-consent"` between `"pick-services"` and `"installing"`.
