# Tasks — gh-141-pickup-label

## 1. Shared IPC types & config-store

- [ ] 1.1 Add `add-label` to InfraAction union, AddLabelParams type, and AddLabelResult type in shared/ipc.ts <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->
- [ ] 1.2 Add getProjectPickupLabels/setProjectPickupLabels to ConfigBridge in shared/ipc.ts <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->
- [ ] 1.3 Add projectPickupLabels to ConfigSchema and CRUD functions in config-store.ts <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [src/main/config-store.ts] -->
- [ ] 1.4 Wire config:getProjectPickupLabels and config:setProjectPickupLabels IPC handlers in main/index.ts <!-- agent: frontend-engineer.build, depends_on: [1.3], touches: [src/main/index.ts] -->
- [ ] 1.5 Wire add-label case in infra:executeAction handler in main/index.ts <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/index.ts] -->
- [ ] 1.6 Add new config channels to preload/index.ts <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [src/preload/index.ts] -->

## 2. Renderer services & UI

- [ ] 2.1 Add getProjectPickupLabels/setProjectPickupLabels to IConfigService interface <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [src/renderer/src/services/interfaces.ts] -->
- [ ] 2.2 Implement new ConfigService methods in impl/ConfigService.ts <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/services/impl/ConfigService.ts] -->
- [ ] 2.3 Implement new MockConfigService methods in mock/MockServices.ts <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/services/mock/MockServices.ts] -->
- [ ] 2.4 Add MockInfraService add-label handler <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/services/mock/MockServices.ts] -->
- [ ] 2.5 Add i18n keys for pickup label flow to en.json <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/renderer/src/i18n/en.json] -->

## 3. Chat flow — offer pickup label after issue creation

- [ ] 3.1 In InfraChatPanel: after successful issue creation, look up pickup labels and offer to apply them via a follow-up question <!-- agent: frontend-engineer.build, depends_on: [2.1, 1.1], touches: [src/renderer/src/components/InfraChatPanel.tsx] -->
- [ ] 3.2 In InfraChatPanel: detect "set pickup label" intent to configure labels via chat <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/components/InfraChatPanel.tsx] -->

## 4. Verification

- [ ] 4.1 Run typecheck and fix any errors <!-- agent: frontend-engineer.fast, depends_on: [3.2], touches: [] -->
