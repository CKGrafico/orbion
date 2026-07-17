# Reach Method Wizard Step — Specification

## Overview

The add-instance wizard must let users choose between two reach methods before collecting connection details:

1. **Local / already reachable** — the loop-task daemon is already running and reachable at a known HTTP(S) URL
2. **SSH** — the daemon is on a remote VM that requires an SSH connection

## Reach Method Type

```typescript
export type ReachMethod = "local" | "ssh";
```

Added to `src/shared/ipc.ts`.

## Wizard Step: `pick-reach-method`

A new `VmWizardStep` value that appears first in the step progression. In the UI this is rendered as two side-by-side card-buttons that the user clicks to select. Once selected, the corresponding form fields appear below.

### Local Path

When "Local / already reachable" is selected:
- A single "Daemon URL" input appears (placeholder: `http://localhost:8845`)
- The "Start wizard" button validates:
  - URL must start with `http://` or `https://`
  - The main process performs a health check (`GET /api/projects`) against the URL
- On success, an environment is created with `kind: "direct"`, URL as provided, no `sshTarget`

### SSH Path

When "SSH" is selected:
- The existing target input (`user@host:port`), SSH config host list, and security note appear
- The existing wizard flow continues: probe → pick services → install → pair → done
- The environment is created with `kind: "ssh"`, `sshTarget` = host label

## Persistence

The reach method is persisted as the `AccessEndpoint.kind` field:
- `"direct"` for local/reachable
- `"ssh"` for SSH targets

No additional fields are needed — the existing `kind` and `sshTarget` fields on `AccessEndpoint` fully represent the choice.

## IPC Contract Changes

- `VmWizardBridge.startWizard(target, name?, reachMethod?, directUrl?)` — accepts reach method and optional direct URL
- `VmWizardProgress.reachMethod` — includes the chosen reach method for UI rendering
- `VmWizardStep` — new value `"pick-reach-method"` added

## Validation

### Local Path Validation
1. **URL format**: Must start with `http://` or `https://` (client-side check)
2. **Daemon reachability**: The main process makes a `GET /api/projects` request with a 10s timeout. If it fails, the wizard shows an error and does not proceed.
3. **Duplicate check**: If an environment with the same URL already exists, the wizard shows an error.

### SSH Path Validation
- Unchanged from existing behavior: probe validates reachability and authentication before proceeding.
