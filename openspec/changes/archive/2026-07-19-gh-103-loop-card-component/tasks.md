# Tasks — Loop card component

## Tasks

- [ ] 1.1 Add `loop-card` row kind and `LoopCardRow` type to `chat/types.ts` and add to `TranscriptRow` union <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/chat/types.ts] -->
- [ ] 1.2 Create `LoopCard` component with status dot, name, meta row, failed treatment, and live countdown <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/components/LoopCard.tsx] -->
- [ ] 1.3 Add CSS styles for `.loop-card` to `theme.css` (card, header, meta row, failed state) <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [src/renderer/src/theme.css] -->
- [ ] 1.4 Add i18n strings for loop card labels to `en.json` <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/renderer/src/i18n/en.json] -->
- [ ] 1.5 Wire `loop-card` row rendering into `SessionChatView.tsx` <!-- agent: frontend-engineer.build, depends_on: [1.1, 1.2, 1.3], touches: [src/renderer/src/components/SessionChatView.tsx] -->
- [ ] 1.6 Run `pnpm typecheck` and fix any errors <!-- agent: frontend-engineer.fast, depends_on: [1.1, 1.2, 1.3, 1.4, 1.5], touches: [] -->
