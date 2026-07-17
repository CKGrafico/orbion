# Spec: Pickup label project config

## Storage (config-store.ts)

Add a new top-level key `projectPickupLabels` to `ConfigSchema`:

```ts
projectPickupLabels: Record<string, string[]>;  // keyed by project id
```

### New functions

- `getProjectPickupLabels(projectId: string): string[]`
- `setProjectPickupLabels(projectId: string, labels: string[]): Promise<void>`

### IPC channels

- `config:getProjectPickupLabels` — reads pickup labels for a project.
- `config:setProjectPickupLabels` — writes pickup labels for a project.

## IPC types (shared/ipc.ts)

- Add `getProjectPickupLabels(projectId: string): Promise<string[]>` to `ConfigBridge`.
- Add `setProjectPickupLabels(projectId: string, labels: string[]): Promise<void>` to `ConfigBridge`.

## Preload (preload/index.ts)

Wire the two new `config:` channels through `ipcRenderer.invoke`.

## Renderer: ConfigService

- Add `getProjectPickupLabels(projectId: string): Promise<string[]>` to `IConfigService`.
- Add `setProjectPickupLabels(projectId: string, labels: string[]): Promise<void>` to `IConfigService`.
- Implement in `ConfigService` and `MockConfigService`.
