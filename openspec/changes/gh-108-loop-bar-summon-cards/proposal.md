# Proposal: Clicking a loop-bar segment summons the matching cards into the chat

## Change ID

gh-108-loop-bar-summon-cards

## Summary

Make each segment of the loop summary bar clickable so that clicking it inserts the corresponding live loop card(s) into the current chat stream. "failed" with multiple failures inserts one card per failed loop. "healthy" (running/waiting) inserts cards for all healthy loops.

## Problem

As a user, when the bar says "1 failed" I want to click it and get that loop's card in the conversation, ready to act on. Currently the loop summary bar only displays counts — it has no interactivity. The user must ask the agent to show a loop card, breaking the "chat is the verb" model where the bar acts as a noun the chat conjures.

## Solution

### Approach

1. **LoopSummaryBar gets `onSegmentClick` callback**: A new optional prop that reports which segment kind (healthy, failed, paused, stopped, finished) was clicked. Segments become interactive: cursor pointer, hover state, keyboard accessible (role="button", tabIndex, Enter/Space handlers), and an aria-label for screen readers.

2. **useTranscript gets `insertLoopCards` function**: A new function that accepts an array of loop IDs and an environment ID, and inserts a persisted "loop-summon" system message into the transcript. On hydration, these messages are parsed into `LoopCardRow` entries — one per loop ID — and interleaved into the chat stream by timestamp alongside user messages, assistant messages, and instance-handoff rows.

3. **SessionChatView wires it together**: The `handleSegmentClick` callback maps a `LoopSegmentKind` to the matching loop IDs from the current `loops` prop (healthy → running+waiting; failed/paused/stopped/finished → that exact status), then calls `insertLoopCards` with those IDs and the current `environmentId`.

4. **CSS for clickable segments**: `loop-summary-segment--clickable` class adds cursor, hover background, focus-visible outline, and active-state background.

5. **i18n aria-labels**: `loopSummary.healthyCountAria`, `loopSummary.failedCountAria`, etc. for accessibility.

### Persistence model

Loop-summon messages use the convention: `id` starts with `loop-summon-`, `role: "user"`, content is JSON `{ loopIds: string[], environmentId: string }`. They are recognized by `isSystemNoteMessage()` (same pattern as instance-switch-*) and excluded from chat-turn pairing, then parsed by `parseLoopSummon()` into `LoopCardRow` entries during row building.

### Scope

- **Files changed**: `LoopSummaryBar.tsx` (clickable segments, onSegmentClick prop), `SessionChatView.tsx` (wire handler), `useTranscript.ts` (insertLoopCards, loop-summon persistence/hydration), `theme.css` (clickable segment styles), `en.json` (aria-label i18n keys)
- **No new IPC channels**: Uses existing `transcript:appendMessage` for persistence
- **No new services**: Reads from existing `loops` prop in SessionChatView

## Acceptance Criteria

- [x] Clicking a bar segment inserts the corresponding live loop card(s) into the current chat stream
- [x] "failed" with multiple failures inserts one card per failed loop
- [x] "healthy" inserts cards for all running + waiting loops
- [x] Other exception segments (paused, stopped, finished) insert cards for loops in that status
- [x] Summoned cards are persisted and survive transcript reload
- [x] Segments are keyboard accessible (Enter/Space) and have aria-labels
- [x] Hover/focus/active states provide visual feedback on clickable segments
- [x] `pnpm typecheck` passes for renderer code
