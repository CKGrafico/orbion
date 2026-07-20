# Tasks: Query the fleet for similar loops at creation time

## Change: gh-144-fleet-similar-loops

- [ ] 1.1 Create `src/renderer/src/fleet-similarity.ts` with pure similarity scoring functions: `normalizeCommand()`, `scoreLoopSimilarity()`, `computeSimilarLoops()`, and `SimilarLoopMatch` type. Include match-reason generation for i18n keys. <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/fleet-similarity.ts] -->
- [ ] 1.2 Add `SimilarLoopMatch` type to `src/renderer/src/chat/types.ts` and extend `LoopProposalRow` with optional `similarLoops` field. <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/chat/types.ts] -->
- [ ] 2.1 Update `LoopProposalCard.tsx`: add `similarLoops` prop, render collapsible "Similar loops" section with instance/project attribution, command preview, interval, and "Use as starting point" button. Make `command` and `interval` local editable state so "Use as starting point" can update them. <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [src/renderer/src/components/LoopProposalCard.tsx] -->
- [ ] 2.2 Add CSS styles for similar loops section in `theme.css`: collapsible section header with count badge, match card layout, "Use as starting point" button styling. Match existing dark warm-gray design tokens. <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/theme.css] -->
- [ ] 3.1 Update `SessionChatView.tsx`: compute similar loops when rendering a `LoopProposalRow` by calling `computeSimilarLoops()` with fleet loop data, and pass the result as the `similarLoops` prop. <!-- agent: frontend-engineer.build, depends_on: [1.1, 1.2], touches: [src/renderer/src/components/SessionChatView.tsx] -->
- [ ] 4.1 Add i18n keys for similar loops section: title, count badge, match reasons, "Use as starting point" button label. <!-- agent: frontend-engineer.fast, depends_on: [2.1], touches: [src/renderer/src/i18n/en.json] -->
- [ ] 5.1 Create `tests/fleet-similarity.test.ts` with unit tests for `normalizeCommand`, `scoreLoopSimilarity`, and `computeSimilarLoops`. <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [tests/fleet-similarity.test.ts] -->
- [ ] 6.1 Run `pnpm typecheck` and fix any type errors. <!-- agent: frontend-engineer.fast, depends_on: [1.1, 1.2, 2.1, 2.2, 3.1, 4.1, 5.1], touches: [] -->
