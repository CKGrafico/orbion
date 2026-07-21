## 1. Extract shared healthTooltip

- [ ] 1.1 Add `healthTooltip` export to `src/renderer/src/format.ts` with `IntlShape` parameter type, importing `ConnectionStatus` from shared IPC and `EnvironmentHealth` from types <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/renderer/src/format.ts] -->
- [ ] 1.2 Remove local `healthTooltip` from `src/renderer/src/App.tsx`, add import from `format.ts` <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [src/renderer/src/App.tsx] -->
- [ ] 1.3 Remove local `healthTooltip` from `src/renderer/src/components/Sidebar.tsx`, add import from `format.ts`, remove unused `translateMessage` and `IntlShape` imports <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [src/renderer/src/components/Sidebar.tsx] -->
- [ ] 1.4 Run `pnpm typecheck` and verify zero errors <!-- agent: frontend-engineer.fast, depends_on: [1.2, 1.3], touches: [] -->
