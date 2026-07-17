# Tasks: gh-77-cold-open-empty-state

- [x] 1.1 Add `loaded` flag to useEnvironments return type and value <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/store.ts] -->
- [x] 2.1 Create ColdOpen component with headline, teaching copy, and "Add first machine" button <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/components/ColdOpen.tsx] -->
- [x] 2.2 Add CSS styles for ColdOpen card <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/theme.css] -->
- [x] 3.1 Add i18n strings for cold-open headline, copy, and button <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/renderer/src/i18n/en.json] -->
- [x] 4.1 Integrate ColdOpen into App.tsx: detect empty state, branch layout, hide sidebar/chat <!-- agent: frontend-engineer.build, depends_on: [1.1, 2.1, 3.1], touches: [src/renderer/src/App.tsx] -->
- [x] 5.1 Typecheck and verify no new errors <!-- agent: frontend-engineer.fast, depends_on: [4.1], touches: [] -->
