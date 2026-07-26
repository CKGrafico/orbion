## Why

`startViaSsh()` in `agent-runtime-recovery.ts` interpolates `port` directly into a shell command without validating it is a safe integer in range 1–65535. `openCodePort()` can return `NaN`, `0`, or out-of-range values that pass the `!port` falsy check but are dangerous when interpolated into a shell string. `ssh-launch.ts` already has `assertSafePort()` for this exact scenario. This is a shell injection risk (severity 7/10, issue #358).

## What Changes

- Export `assertSafePort` from `ssh-launch.ts` so it can be reused
- Add `assertSafePort(port, "opencodePort")` call in `startViaSsh()` before shell command construction
- Return `false` when validation fails (consistent with `ssh-launch.ts` early-return pattern)

## Capabilities

### New Capabilities

- `port-validation-recovery`: Validate port before shell interpolation in agent runtime recovery

### Modified Capabilities

## Impact

- `src/main/agent-runtime-recovery.ts`: add assertSafePort guard
- `src/main/ssh-launch.ts`: export assertSafePort function
