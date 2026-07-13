# Migration

## electron-store migration

When `instancesMigrated` is `false` and the store has `instances` but no `environments`:

1. Each `LegacyInstance` (id, name, baseUrl) becomes an `Environment` with a single `direct` endpoint.
2. The endpoint inherits the instance's `id` as its own `id`.
3. `selectedInstanceId` maps to `selectedEnvironmentId`.
4. `instancesMigrated` is set to `true`.

## localStorage migration (renderer, for non-Electron dev mode)

When `lta.environments.v1` doesn't exist but `lta.instances.v1` does:

1. Parse the legacy instances array.
2. Each becomes an `Environment` with a single `direct` endpoint (same mapping as above).
3. Write the migrated data to `lta.environments.v1`.
4. Remove `lta.instances.v1`.
5. `lta.selectedInstance.v1` maps to `lta.selectedEnvironment.v1`.

## preload-mediated migration

When the renderer detects `lta.instances.v1` and `window.api` exists:

1. Send both `rawInstances` and `rawSelectedId` to main via `migrateFromLocalStorage`.
2. Main writes the migrated environments to electron-store.
3. Renderer removes the legacy localStorage keys.
