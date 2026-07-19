## Why

When setting up a new machine, users must re-enter all connection details (host, port, reach method) for their config-home VM before Orbion can restore configuration. This creates a chicken-and-egg problem: the user needs Orbion to get their config, but Orbion needs the config-home VM details to do anything. A tiny, copyable seed containing only non-secret reach information solves this bootstrapping gap.

## What Changes

- **Export bootstrap seed**: A new IPC channel and config-store function that produces a compact, human-copyable string (or file) containing only the config-home VM's reach info (host, port, method). No secrets, no tokens, no passwords.
- **Import bootstrap seed**: A new IPC channel and config-store function that, on a fresh install, accepts a seed string and pre-fills the connection wizard's reach step with the config-home VM's details. The user still provides credentials locally (pairing code, SSH key, etc.).
- **Cold-open integration**: The ColdOpen component gains an "Import seed" action alongside the existing "Add a machine" button, so a fresh install can jump straight to the connection step.
- **Main-VM selection**: Export uses the environment marked `role: "main-vm"` as the seed source, mirroring how the rest of the app treats the main VM as the config-home.

## Capabilities

### New Capabilities
- `bootstrap-seed`: Export/import of a compact, non-secret string that encodes how to reach the config-home VM, enabling portable onboarding on fresh machines.

### Modified Capabilities
- `ssh-loop-task-onboarding`: The onboarding wizard accepts an optional pre-fill from an imported seed, skipping the reach-method and target steps when the seed provides them.

## Impact

- **Main process**: New IPC channels `config:exportBootstrapSeed` and `config:importBootstrapSeed` in `src/main/index.ts`; new functions in `src/main/config-store.ts`.
- **Shared types**: New `BootstrapSeed` type and `ConfigBridge` methods in `src/shared/ipc.ts`.
- **Preload**: New bridge method entries in `src/preload/index.ts`.
- **Renderer services**: `IConfigService` interface gains `exportBootstrapSeed()` and `importBootstrapSeed()`; both real (`ConfigService`) and mock (`MockConfigService`) implementations.
- **Cold-open UI**: `ColdOpen.tsx` gains an "Import seed" button; `App.tsx` wires it through.
- **i18n**: New keys for seed export/import UI strings in `en.json`.
- **IPC validation**: New validators in `src/main/ipc-validation.ts`.
- **Tests**: New Vitest test file for the seed encode/decode pure logic.
