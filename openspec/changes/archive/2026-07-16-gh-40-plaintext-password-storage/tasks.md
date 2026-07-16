## 1. Shared types and IPC contract

- [x] 1.1 Add `wasEncrypted?: boolean` to `OpenCodeEndpoint` interface and add `SetOpenCodeEndpointResult` type in `src/shared/ipc.ts` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->
- [x] 1.2 Update `ConfigBridge.setOpenCodeEndpoint` return type from `Promise<void>` to `Promise<SetOpenCodeEndpointResult>` in `src/shared/ipc.ts` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/shared/ipc.ts] -->

## 2. Main-process config-store encryption guard

- [x] 2.1 Modify `_setOpenCodeEndpoint()` to return `SetOpenCodeEndpointResult`: reject with `{ ok: false, reason: "encryption-unavailable" }` when password is non-null and `safeStorage.isEncryptionAvailable()` is false; set `wasEncrypted: true` on successful encryption <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/config-store.ts] -->
- [x] 2.2 Update public `setOpenCodeEndpoint()` to propagate the result from `_setOpenCodeEndpoint()` <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/main/config-store.ts] -->

## 3. Main-process opencode-client safe decryption

- [x] 3.1 Update `makeClient()` to use `wasEncrypted` flag: if `wasEncrypted === true` and decryption returns null, do NOT fall back to raw string; if `wasEncrypted` is false/undefined, use raw password (legacy compat) <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/opencode-client.ts] -->

## 4. IPC handler and validation

- [x] 4.1 Update IPC handler for `config:setOpenCodeEndpoint` in `src/main/index.ts` to return the `SetOpenCodeEndpointResult` and show `dialog.showMessageBox()` when `reason` is `"encryption-unavailable"` <!-- agent: frontend-engineer.build, depends_on: [2.2], touches: [src/main/index.ts] -->
- [x] 4.2 Update IPC validation for `config:setOpenCodeEndpoint` in `src/main/ipc-validation.ts` to allow the optional `wasEncrypted` boolean field <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [src/main/ipc-validation.ts] -->

## 5. Preload bridge update

- [x] 5.1 Update preload bridge `setOpenCodeEndpoint` return type to `Promise<SetOpenCodeEndpointResult>` in `src/preload/index.ts` <!-- agent: frontend-engineer.fast, depends_on: [1.2], touches: [src/preload/index.ts] -->

## 6. Renderer service and store updates

- [x] 6.1 Update IConfigService `IConfigService.setOpenCodeEndpoint` return type in `src/renderer/src/services/interfaces.ts` <!-- agent: frontend-engineer.fast, depends_on: [1.2], touches: [src/renderer/src/services/interfaces.ts] -->
- [x] 6.2 Update ConfigService `ConfigService.setOpenCodeEndpoint` implementation in `src/renderer/src/services/impl/ConfigService.ts` and propagate the result <!-- agent: frontend-engineer.fast, depends_on: [6.1], touches: [src/renderer/src/services/impl/ConfigService.ts] -->
- [x] 6.3 Update MockServices `MockServices.setOpenCodeEndpoint` in `src/renderer/src/services/mock/MockServices.ts` <!-- agent: frontend-engineer.fast, depends_on: [6.1], touches: [src/renderer/src/services/mock/MockServices.ts] -->
- [x] 6.4 Update useEnvironments `useEnvironments` store hook in `src/renderer/src/store.ts` to handle `SetOpenCodeEndpointResult` and show error feedback when `ok === false` <!-- agent: frontend-engineer.build, depends_on: [6.2], touches: [src/renderer/src/store.ts] -->

## 7. Verification

- [x] 7.1 Run `pnpm typecheck` and fix any type errors <!-- agent: frontend-engineer.fast, depends_on: [2.1, 3.1, 4.1, 4.2, 5.1, 6.4], touches: [] -->
