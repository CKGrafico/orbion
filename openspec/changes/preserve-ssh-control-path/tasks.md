# Tasks

- [x] 1.1 Model a separate SSH control target and migrate existing endpoint-backed SSH settings. <!-- agent: , depends_on: [], touches: [src/shared/ipc.ts, src/main/config-store.ts, src/main/ipc-validation.ts, src/preload/index.ts] -->
- [x] 1.2 Update VM wizard and endpoint editing so direct/Tailscale daemon access preserves SSH control access. <!-- agent: , depends_on: [1.1], touches: [src/main/vm-wizard.ts, src/main/index.ts, src/renderer/src/components/**, src/renderer/src/services/**] -->
- [x] 2.1 Make runtime recovery use separate SSH control target; deduplicate recovery attempts and report actionable errors. <!-- agent: , depends_on: [1.1], touches: [src/main/agent-runtime-recovery.ts, src/main/agent-client.ts, src/main/agent-models.ts, src/renderer/src/components/SessionChatView.tsx, src/renderer/src/i18n/en.json] -->
- [x] 3.1 Add migration/recovery tests and verify typecheck/build. <!-- agent: , depends_on: [1.1, 1.2, 2.1], touches: [tests/**] -->
