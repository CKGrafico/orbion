# Tasks

## Done

- [x] T1: Define Environment, AccessEndpoint, EndpointKind types in shared/ipc.ts
- [x] T2: Define Environment, AccessEndpoint in renderer/types.ts
- [x] T3: Implement electron-store migration (LegacyInstance → Environment)
- [x] T4: Implement localStorage migration (lta.instances → lta.environments)
- [x] T5: Implement preload-mediated migration
- [x] T6: Remove stale Instance type and re-export from api.ts
- [x] T7: Rename AddInstanceModal → AddEnvironmentModal
- [x] T8: Add EndpointHealthTracker to connection-supervisor.ts
- [x] T9: Wire endpoint health IPC events (main → renderer)
- [x] T10: Sidebar per-endpoint health indicators
- [x] T11: App.tsx subscribes to onEndpointHealthChange
- [x] T12: Fingerprint route support (fetchFingerprint)
- [x] T13: Fingerprint-based environment collapse on addEnvironment
- [x] T14: config-store fingerprintId support (findEnvironmentByFingerprint, setEnvironmentFingerprintId)
- [x] T15: Update package.json description (instances → environments)
- [x] T16: Typecheck passes with zero errors
