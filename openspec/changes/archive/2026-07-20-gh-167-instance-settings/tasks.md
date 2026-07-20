## 1. IPC & Config Store

- [ ] 1.1 Add `updateEnvironment` method to ConfigBridge in `src/shared/ipc.ts` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->
- [ ] 1.2 Implement `_updateEnvironment` and `updateEnvironment` in `src/main/config-store.ts` using `mutateEnvironment` pattern <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/config-store.ts] -->
- [ ] 1.3 Register `config:updateEnvironment` IPC handler in `src/main/index.ts` <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [src/main/index.ts] -->
- [ ] 1.4 Add `updateEnvironment` validation schema in `src/main/ipc-validation.ts` <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [src/main/ipc-validation.ts] -->
- [ ] 1.5 Wire `config:updateEnvironment` in preload `src/preload/index.ts` <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [src/preload/index.ts] -->

## 2. Service Layer

- [ ] 2.1 Add `updateEnvironment` to `IConfigService` interface in `src/renderer/src/services/interfaces.ts` <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [src/renderer/src/services/interfaces.ts] -->
- [ ] 2.2 Implement `updateEnvironment` in `ConfigService` impl `src/renderer/src/services/impl/ConfigService.ts` <!-- agent: frontend-engineer.fast, depends_on: [2.1], touches: [src/renderer/src/services/impl/ConfigService.ts] -->
- [ ] 2.3 Add mock `updateEnvironment` in `src/renderer/src/services/mock/MockServices.ts` <!-- agent: frontend-engineer.fast, depends_on: [2.1], touches: [src/renderer/src/services/mock/MockServices.ts] -->
- [ ] 2.4 Add `updateEnvironment` to `useInstances` hook in `src/renderer/src/store.ts` <!-- agent: frontend-engineer.fast, depends_on: [2.1], touches: [src/renderer/src/store.ts] -->

## 3. i18n Keys

- [ ] 3.1 Add i18n keys for InstanceSettingsPanel to `src/renderer/src/i18n/en.json` <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/renderer/src/i18n/en.json] -->

## 4. InstanceSettingsPanel Component

- [ ] 4.1 Create `InstanceSettingsPanel` component in `src/renderer/src/components/InstanceSettingsPanel.tsx` with Reach, Runtime, Credentials, Remove sections <!-- agent: frontend-engineer.build, depends_on: [2.1, 3.1], touches: [src/renderer/src/components/InstanceSettingsPanel.tsx] -->
- [ ] 4.2 Add InstanceSettingsPanel styles to `src/renderer/src/theme.css` <!-- agent: frontend-engineer.build, depends_on: [4.1], touches: [src/renderer/src/theme.css] -->

## 5. InstanceSelector Integration

- [ ] 5.1 Add gear icon and `onOpenSettings` callback to `InstanceSelector` component <!-- agent: frontend-engineer.build, depends_on: [4.1], touches: [src/renderer/src/components/InstanceSelector.tsx] -->
- [ ] 5.2 Wire InstanceSettingsPanel in `App.tsx`: state for open/settings target instance, onOpenSettings handler, render drawer <!-- agent: frontend-engineer.build, depends_on: [4.1, 5.1], touches: [src/renderer/src/App.tsx] -->

## 6. Reconnect & Verification

- [ ] 6.1 Add reconnect-on-endpoint-change logic in App.tsx (call connection.retry on active endpoint change) <!-- agent: frontend-engineer.build, depends_on: [5.2], touches: [src/renderer/src/App.tsx] -->
- [ ] 6.2 Run `pnpm typecheck` and fix any type errors <!-- agent: frontend-engineer.fast, depends_on: [1.3, 1.4, 1.5, 2.2, 2.3, 2.4, 4.1, 4.2, 5.1, 5.2, 6.1], touches: [] -->
