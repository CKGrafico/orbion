# Tasks: Clicking a loop-bar segment summons the matching cards into the chat

## Change ID

gh-108-loop-bar-summon-cards

## Tasks

- [x] 1.1 Add `LoopSegmentKind` type and `onSegmentClick` optional callback prop to `LoopSummaryBar` <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/components/LoopSummaryBar.tsx] -->
- [x] 1.2 Make bar segments interactive (cursor, role=button, tabIndex, keyboard handlers, aria-label) <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/components/LoopSummaryBar.tsx] -->
- [x] 2.1 Add `isLoopSummonMessage`, `parseLoopSummon` helpers to useTranscript <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/chat/useTranscript.ts] -->
- [x] 2.2 Update `buildRowsFromTurns` to accept and render `loopSummonMessages` as `LoopCardRow` entries <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/chat/useTranscript.ts] -->
- [x] 2.3 Add `insertLoopCards` function and `loopSummonMessages` state to `useTranscript` hook <!-- agent: frontend-engineer.build, depends_on: [2.2], touches: [src/renderer/src/chat/useTranscript.ts] -->
- [x] 3.1 Wire `handleSegmentClick` in `SessionChatView` (map segment kind → loop IDs → insertLoopCards) <!-- agent: frontend-engineer.build, depends_on: [1.1, 2.3], touches: [src/renderer/src/components/SessionChatView.tsx] -->
- [x] 4.1 Add CSS styles for `.loop-summary-segment--clickable` (cursor, hover, focus-visible, active) <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/renderer/src/theme.css] -->
- [x] 5.1 Add i18n aria-label keys for loop summary segments <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/renderer/src/i18n/en.json] -->
- [x] 6.1 TypeCheck verification — all renderer code compiles cleanly <!-- agent: frontend-engineer.fast, depends_on: [3.1, 4.1, 5.1], touches: [] -->
