# Spec: Environment Role Model

## Fields

### EnvironmentRole

```ts
type EnvironmentRole = "coding" | "main-vm";
```

- Default: `"coding"`
- `Environment.role: EnvironmentRole` — new required field, defaults to `"coding"` on deserialization for backward compat.

### Environment.infraOpenCode

```ts
infraOpenCode?: OpenCodeEndpoint | null;
```

- Only meaningful when `role === "main-vm"`.
- Points to the admin-scoped OpenCode runtime for infra operations.

## Invariants

- At most one environment may have `role: "main-vm"` at any time.
- Setting an environment as main-vm clears the role from the previous holder.
- A main-vm environment also has a normal `opencode` endpoint for coding sessions — these are separate runtimes.
- The `infraOpenCode` endpoint uses `admin`-scoped session tokens.

## Persistence

- `role` and `infraOpenCode` are persisted alongside the environment in `electron-store`.
- Migration: existing environments without `role` get `"coding"` on load.

## IPC additions

- `config:setMainVm(environmentId: string): Promise<void>` — promotes an environment to main-vm, demotes the previous.
- `config:getMainVmId(): Promise<string | null>` — returns the current main-vm environment id.
