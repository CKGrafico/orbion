# Tasks

- [ ] 1.1 Add `SerializableValue` type and update `LogEntry.context` in `src/shared/log.ts` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/log.ts] -->
- [ ] 1.2 Update `McpToolInfo.inputSchema` type from `unknown` to `Record<string, unknown>` in `src/shared/ipc.ts` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->
- [ ] 2.1 Add TSDoc constraint note to `ApiResponse<T>` and `McpToolCallResult.data` in `src/shared/ipc.ts` <!-- agent: frontend-engineer.fast, depends_on: [1.2], touches: [src/shared/ipc.ts] -->
- [ ] 3.1 Add context value serialization validation to `log:write` validator in `src/main/ipc-validation.ts` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/ipc-validation.ts] -->
- [ ] 3.2 Update `formatLogContext` type signature to use `SerializableValue` in `src/main/index.ts` <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [src/main/index.ts] -->
- [ ] 4.1 Update `LogService.write` context parameter type to `Record<string, SerializableValue>` in `src/renderer/src/services/impl/LogService.ts` <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [src/renderer/src/services/impl/LogService.ts] -->
- [ ] 5.1 Add tests for context value serialization validation in `tests/ipc-validation.test.ts` <!-- agent: frontend-engineer.build, depends_on: [3.1], touches: [tests/ipc-validation.test.ts] -->
- [ ] 6.1 Run `pnpm typecheck` and fix any errors <!-- agent: frontend-engineer.fast, depends_on: [1.1,1.2,2.1,3.1,3.2,4.1,5.1], touches: [] -->
