# Tasks: Enable renderer sandbox

- [ ] 1.1 Change `sandbox: false` to `sandbox: true` in `src/main/index.ts` line 339, inside the `createWindow()` function's `webPreferences` object <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/main/index.ts] -->
- [ ] 1.2 Audit preload script to confirm no Node.js APIs are used that would break under sandbox mode <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/preload/index.ts] -->
- [ ] 2.1 Run `pnpm typecheck` and verify no regressions <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [] -->
