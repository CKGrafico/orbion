# gh-124 Tasks

- [x] 1.1 Add `projectHasFailedLoop` helper in Sidebar.tsx that checks loop failure status, excluding unreachable instances <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/components/Sidebar.tsx] -->
- [x] 1.2 Add failure pip rendering on project row dot with tooltip <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/components/Sidebar.tsx] -->
- [x] 1.3 Add CSS for `.tree-dot-wrap` and `.tree-dot-pip` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/theme.css] -->
- [x] 1.4 Add i18n key `sidebar.projectHasFailure` <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/renderer/src/i18n/en.json] -->
- [x] 1.5 Verify pnpm typecheck passes <!-- agent: frontend-engineer.fast, depends_on: [1.1,1.2,1.3,1.4], touches: [] -->
