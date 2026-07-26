## 1. Preload Fix

- [x] 1.1 Replace `void ipcRenderer.invoke("log:write", entry)` with explicit `.catch()` in `src/preload/index.ts`

## 2. Verification

- [x] 2.1 Run `pnpm typecheck` — must pass
- [x] 2.2 Run `pnpm test` — must pass
- [x] 2.3 Run `pnpm build` — must pass
