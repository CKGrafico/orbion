## Context

Orbion stores all configuration locally (electron-store + credential-vault). When a user sets up a new machine, they currently must walk through the entire "Add a VM" wizard from scratch, entering SSH hosts, choosing reach methods, and authenticating. The config-home VM (role: "main-vm") is the canonical source of truth for `~/.orbion/config.json`, but the user cannot reach it until they complete the wizard.

The existing vm-wizard flow (`src/main/vm-wizard.ts`) handles SSH probing, loop-task installation, tunnel forwarding, and pairing. It starts from a `VmWizardStartOptions` object containing the target, reach method, and agent runtime. The ColdOpen component (`ColdOpen.tsx`) shows an "Add a machine" button that launches this wizard.

The config-store already has `getMainVm()` and `getEnvironmentsForRenderer()` which expose the main-vm environment with its endpoints sanitized for renderer consumption.

## Goals / Non-Goals

**Goals:**
- Export a compact, non-secret string that encodes how to reach the config-home VM (host, port, reach method, environment name)
- Import this seed on a fresh install to pre-fill the VM wizard's connection step, skipping the reach-method and target selection
- The seed contains ONLY non-secret reach information; credentials are always supplied locally
- The seed format is URL-like and copyable (fits in a clipboard, can be saved as a tiny file)
- Keep the mock adapter working for `pnpm dev:web`

**Non-Goals:**
- Two-way config sync (explicitly rejected in the design model)
- Syncing secrets, tokens, or passwords across machines
- Automated zero-touch restore (the user must still authenticate)
- Changing the VM wizard flow beyond pre-filling the connection step
- Supporting seeds for non-main-VM environments

## Decisions

### 1. Seed format: `orbion://` custom URI scheme

**Decision**: Use a custom URI scheme like `orbion://ssh:user@host:22#env-name` or `orbion://direct:http://host:8845#env-name`.

**Rationale**: URI schemes are copyable, recognizable, and self-describing. They fit in a clipboard, can be sent over any text channel, and are visually distinct from random text. The `orbion://` prefix makes it clear this is an Orbion bootstrap seed, not a random URL. Using the fragment (`#`) for the environment name keeps the main URI clean.

**Alternatives considered**:
- Base64-encoded JSON: opaque, not human-readable, harder to debug
- Plain JSON: not copyable-friendly, needs wrapping in code fences
- QR code: overkill for desktop; the user can just copy text

### 2. Seed encoding: minimal, human-readable

**Decision**: Encode as `orbion://<kind>:<target>#<name>` where:
- `kind` = `ssh` | `direct`
- `target` for SSH = `user@host:port`
- `target` for direct = URL (percent-encoded if needed)
- `name` = environment name (fragment, percent-encoded)

**Rationale**: The seed is only ~30-80 characters for typical SSH targets. No secrets included. The user can read it and verify it looks right before importing.

### 3. Import flow: pre-fill wizard, not auto-add

**Decision**: Importing a seed sets the initial values on the AddVmWizard (target, reach method, environment name) but does NOT auto-create an environment. The user still walks through probing, consent, and pairing.

**Rationale**: The wizard handles critical safety steps (host-key verification, loop-task installation, pairing code exchange). Skipping these would undermine security. Pre-filling the first step is the right balance: the user sees familiar data and confirms it.

### 4. Export surface: cold-open card + settings

**Decision**: Export is available from (a) the ColdOpen card (for the machine that already has the VM configured) and (b) the InstanceDetail component for the main VM. The seed is copied to clipboard.

**Rationale**: The most common flow is "export from old machine, import on new machine." Putting export on the cold-open screen of the *source* machine is awkward (it already has a VM). Instead, export is on the main VM's detail view. Import is on the cold-open screen of the *target* (fresh) machine.

### 5. Main-VM as the seed source

**Decision**: Export always uses the environment with `role: "main-vm"`. If no main VM is set, export returns an error indicating the user should designate a main VM first.

**Rationale**: The issue is specifically about the config-home VM. Using the main-vm role ensures the seed points to the machine that holds `~/.orbion/config.json`.

## Risks / Trade-offs

- **[Seed does not include credentials]** The user must still authenticate on the new machine. This is by design but may feel incomplete. Mitigation: UI clearly states "credentials required on import."
- **[Main-VM not set]** If no environment has `role: "main-vm"`, export fails gracefully. Mitigation: surface a clear error with a link to pick a main VM.
- **[Seed format versioning]** Adding fields later could break older seeds. Mitigation: the URI scheme is extensible via query parameters (`?v=1&sshKey=path`); parsers ignore unknown parameters.
- **[Clipboard security]** Seeds contain hostnames and ports, which are low-sensitivity. No secrets are leaked. This is acceptable per the design model's "config stores references, never secrets" principle.
