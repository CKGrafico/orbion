# Tasks — gh-97 Contextual Instance Selector

- [ ] 1.1 Create InstanceSelector component with dropdown, filtering, and per-row info (health dot, name, path, loop count, home marker) <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/components/InstanceSelector.tsx] -->
- [ ] 1.2 Add i18n keys for instance selector under instanceSelector.* <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/renderer/src/i18n/en.json] -->
- [ ] 1.3 Add CSS styles for InstanceSelector dropdown <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [src/renderer/src/theme.css] -->
- [ ] 2.1 Wire InstanceSelector into session header in App.tsx, pass perEnvProjects/perEnvLoops/health/reachability as props <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/App.tsx] -->
- [ ] 2.2 Handle instance switch: update ChatSession.environmentId and workingDirectory, add transcript note <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/App.tsx] -->
- [ ] 3.1 Run pnpm typecheck and fix any errors <!-- agent: frontend-engineer.fast, depends_on: [2.2], touches: [] -->
