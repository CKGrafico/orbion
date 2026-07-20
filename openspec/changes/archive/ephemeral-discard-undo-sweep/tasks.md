## 1. Toast System

- [ ] 1.1 Create Toast React component with provider, hook, and CSS styles <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/components/Toast.tsx, src/renderer/src/theme.css] -->
- [ ] 1.2 Add i18n keys for toast labels and ephemeral-discard messages <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/renderer/src/i18n/en.json] -->

## 2. Ephemeral Discard on Leave

- [ ] 2.1 Add discard-on-leave detection logic in App.tsx — track previous ephemeral session ID, trigger discard flow when navigating away from an unpersisted session <!-- agent: frontend-engineer.build, depends_on: [1.1, 1.2], touches: [src/renderer/src/App.tsx] -->
- [ ] 2.2 Wire Undo button in toast to navigate back to the session and cancel the pending deletion <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/App.tsx] -->
- [ ] 2.3 Implement final deletion after undo window expires — call removeChatSession + transcript:deleteSession <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/App.tsx] -->

## 3. Inactivity Sweep

- [ ] 3.1 Add sweepEphemeralSessions function to main-process config-store.ts <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/config-store.ts] -->
- [ ] 3.2 Add config:sweepEphemeralSessions IPC handler in main/index.ts, including IPC validation <!-- agent: frontend-engineer.build, depends_on: [3.1], touches: [src/main/index.ts, src/main/ipc-validation.ts, src/shared/ipc.ts, src/preload/index.ts] -->
- [ ] 3.3 Wire sweep timer in App.tsx — setInterval(30min) calling the sweep IPC, clean up removed sessions from local state <!-- agent: frontend-engineer.build, depends_on: [3.2, 2.1], touches: [src/renderer/src/App.tsx] -->

## 4. Mock Adapter & DI

- [ ] 4.1 Add sweepEphemeralSessions mock implementation in MockServices.ts and add method to IConfigService interface <!-- agent: frontend-engineer.build, depends_on: [3.2], touches: [src/renderer/src/services/interfaces.ts, src/renderer/src/services/mock/MockServices.ts, src/renderer/src/services/impl/ConfigService.ts] -->

## 5. Polish & Verify

- [ ] 5.1 Run typecheck and fix any errors <!-- agent: frontend-engineer.fast, depends_on: [4.1], touches: [] -->
