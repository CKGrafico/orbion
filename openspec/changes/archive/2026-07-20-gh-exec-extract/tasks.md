# Tasks: gh-exec-extract

- [ ] 1.1 Create `src/main/gh-exec.ts` with `ghExec()` helper, CLI sanitization functions (`validateLabels`, `validateRepo`, `sanitizeText`, `validateCliInputs`), and regex constants <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/gh-exec.ts] -->
- [ ] 1.2 Create `src/main/infra-handlers.ts` with all infra action handlers extracted from index.ts (create-issue, add-label, edit-issue, bulk-relabel, list-issues, list-prs-awaiting-review, get-pr-verdict, get-pr-diff, get-pr-briefing, submit-pr-review, open-pr-in-browser, machine-status, clone-repo, detect-platform) <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/infra-handlers.ts] -->
- [ ] 1.3 Move `parseDiffFiles()` into `src/main/diff-analyzer.ts` and export it <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/diff-analyzer.ts] -->
- [ ] 1.4 Move `detectPlatform()`, `platformCache`, `platformCacheKey()` into `src/main/platform-classifier.ts` and export them <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/main/platform-classifier.ts] -->
- [ ] 2.1 Slim `index.ts`: remove extracted code, import from new modules, keep only app lifecycle + safeHandle registrations + supervisor/stream helpers <!-- agent: frontend-engineer.build, depends_on: [1.1, 1.2, 1.3, 1.4], touches: [src/main/index.ts] -->
- [ ] 3.1 Run `pnpm typecheck` and fix any broken imports or type errors <!-- agent: frontend-engineer.fast, depends_on: [2.1], touches: [] -->
- [ ] 3.2 Run existing tests (`npx vitest`) and verify no regressions <!-- agent: frontend-engineer.fast, depends_on: [3.1], touches: [] -->
