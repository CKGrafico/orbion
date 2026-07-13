# Design: Infra Assistant

## Overview

Add an `EnvironmentRole` discriminated flag to the existing `Environment` model. The first environment added becomes the "main" VM (`role: "main-vm"`). All other coding environments keep `role: "coding"` (the default). The main VM gets a second, dedicated OpenCode runtime for infrastructure tasks, surfaced as a distinct chat panel pinned outside the per-project thread list.

## Data model changes

### Environment.role

```ts
type EnvironmentRole = "coding" | "main-vm";
```

- Added to `Environment` in `shared/ipc.ts` with default `"coding"` for backward compat.
- `EnvironmentWithFingerprint` in `config-store.ts` inherits the field.
- `addEnvironment()` defaults to `"coding"`.
- New `config:setMainVm` IPC channel promotes an environment to `"main-vm"`. At most one environment can hold this role; assigning it to a new env clears it from the old.

### Main VM auto-assignment

When the first environment is added and no main-vm exists, it is automatically promoted. When the main-vm is removed, a prompt fires to reassign.

## Infra runtime

The main-vm environment gets a second OpenCode endpoint (`infraOpenCode`) distinct from its coding one (`opencode`). The infra OpenCode runs with `admin`-scoped session tokens, while coding sessions use `read-only` or `operate` scope.

- `infraOpenCode: OpenCodeEndpoint | null` added to `Environment`.
- A new IPC bridge `infra` manages infra-runtime status and operations.

## Infra chat surface

A new component `InfraChatPanel` renders in the sidebar, below the environment list, as a pinned panel with a distinct visual identity (amber/violet border, infrastructure icon, "Infrastructure" label).

- It reuses the existing `TranscriptView` / `ChatComposer` architecture but is wired to the infra OpenCode runtime.
- Infra chat sessions are never shown inside any coding VM's session list.
- The infra panel is only visible when a main-vm exists.

## Infra toolset

The infra OpenCode runtime exposes admin-scoped operations through the daemon API:

1. **Machine status report** — `GET /api/machines` (or equivalent daemon endpoint) → formatted summary.
2. **Clone repo on a VM** — `POST /api/repos/clone` with `{ vmId, repoUrl }` → clone initiated.

These are exposed as IPC channels under `infra:executeAction` that the infra chat panel calls.

## Main VM removal

When the main-vm is removed:

1. If other coding environments exist, show a modal prompting the user to pick a new main VM.
2. If no other environments exist, the infra panel disappears.

## File impact

| File | Change |
|------|--------|
| `shared/ipc.ts` | Add `EnvironmentRole`, `role` to `Environment`, `infraOpenCode`, `InfraBridge`, `ConfigBridge.setMainVm` |
| `main/config-store.ts` | Persist `role`, `infraOpenCode`; `setMainVm()` logic |
| `main/index.ts` | New IPC handlers for `infra:*`, `config:setMainVm` |
| `main/opencode-client.ts` | Support infra OpenCode connections (separate cache key) |
| `preload/index.ts` | Wire `infra` bridge and new config methods |
| `renderer/src/types.ts` | Re-export `EnvironmentRole` |
| `renderer/src/App.tsx` | Render `InfraChatPanel` when main-vm exists |
| `renderer/src/components/Sidebar.tsx` | Show infra section below environments |
| `renderer/src/components/InfraChatPanel.tsx` | New — infra chat surface with distinct visuals |
| `renderer/src/components/PickMainVmModal.tsx` | New — prompt when main-vm removed |
| `renderer/src/theme.css` | Infra accent color, panel styles |
| `renderer/src/store.ts` | Expose `mainVm`, `setMainVm` |
