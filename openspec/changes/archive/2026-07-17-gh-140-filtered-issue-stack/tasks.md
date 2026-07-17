# Tasks

- [ ] 1.1 Add `list-issues` to `InfraAction` union and `ListIssuesParams`, `IssueCard`, `ListIssuesResult` types to `src/shared/ipc.ts` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->
- [ ] 1.2 Add i18n keys for issue stack messages to `src/renderer/src/i18n/en.json` <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/renderer/src/i18n/en.json] -->
- [ ] 2.1 Implement `list-issues` action handler in `src/main/index.ts` (gh issue list + az fallback) <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/index.ts] -->
- [ ] 3.1 Add issue-listing intent detection and card-stack formatting to `src/renderer/src/components/InfraChatPanel.tsx` <!-- agent: frontend-engineer.build, depends_on: [1.1, 1.2], touches: [src/renderer/src/components/InfraChatPanel.tsx] -->
- [ ] 3.2 Add `issue://` link click handler in `InfraChatPanel.tsx` to open issue URLs in system browser <!-- agent: frontend-engineer.fast, depends_on: [3.1], touches: [src/renderer/src/components/InfraChatPanel.tsx] -->
- [ ] 3.3 Add compact issue-card styling to `src/renderer/src/theme.css` <!-- agent: frontend-engineer.fast, depends_on: [3.1], touches: [src/renderer/src/theme.css] -->
- [ ] 4.1 Add mock `list-issues` handler to `MockInfraService` in `src/renderer/src/services/mock/MockServices.ts` <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [src/renderer/src/services/mock/MockServices.ts] -->
- [ ] 5.1 Run `pnpm typecheck` and fix any errors <!-- agent: frontend-engineer.fast, depends_on: [2.1, 3.1, 3.2, 3.3, 4.1], touches: [] -->
