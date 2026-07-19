# Proposal: Loop summary bar under the chat header

## Change ID

gh-102-loop-summary-bar

## Summary

Add a thin always-visible line under the chat header that summarizes this project x instance's loops: healthy counts collapsed to a single number, exception states (failed, paused, finished) as separate colored segments, the most imminent next-run countdown, and a nudge when there are no loops.

## Problem

Users in a chat session have no at-a-glance view of their loop health. They must navigate away from the chat to check the sidebar or instance view, breaking the chat-first workflow. The issue asks: "a thin always-visible line summarizing this project x instance's loops - health, what's next, or a nudge when there are none."

Additionally, the `LoopStatus` type was missing the `failed` and `finished` states that the loop-task daemon actually reports, meaning loops in those states could not be properly represented.

## Solution

### Approach

1. **Extend LoopStatus**: Add `"failed"` and `"finished"` to the `LoopStatus` union type, along with corresponding `STATUS_COLORS` entries and CSS custom properties.
2. **LoopSummaryBar component**: A new pure-presentational component that receives scoped loops and reachability, and renders:
   - Healthy loops (running + waiting) as a single count ("5 running")
   - Exception states (failed, paused, finished) as separate colored segments only when nonzero; failures use the alert/danger color
   - Right side: the most imminent next run ("next: in 4m"), ticking down via a countdown hook
   - With zero loops: "No loops yet — ask to create one" instead of disappearing
   - When the instance is unreachable: a muted "X loops — status unknown" state
3. **useNextRunCountdown hook**: A lightweight hook that computes human-readable countdown labels and ticks every 10 seconds.
4. **Wire into SessionChatView**: The bar appears under the unreachable banner and above the chat scroll area.
5. **Scope loops in App.tsx**: When rendering the session view, filter `perEnvLoops` to the session's home project before passing to the component.
6. **Mock data**: Add mock loops with `failed`, `finished`, and `paused` states so the bar shows realistic data in mock mode.

### Scope

- **New files**: `LoopSummaryBar.tsx`, `useNextRunCountdown.ts`
- **Files changed**: `SessionChatView.tsx` (add bar, accept loops prop), `App.tsx` (scope loops, pass to view), `types.ts` (extend LoopStatus), `format.ts` (add STATUS_COLORS entries), `fleet-mapping.ts` (map failed/finished), `theme.css` (bar styles + CSS vars), `en.json` (i18n keys), `MockServices.ts` (mock loops)
- **No new IPC channels**: Reads from existing `perEnvLoops` state already polled by App.tsx.
- **No new services**: Pure-presentational component reads from props.

## Acceptance Criteria

- [ ] Bar renders under the header, scoped to the session's home project + instance
- [ ] Healthy loops collapse to a single count ("5 running"); exception states appear as separately colored segments only when nonzero; failures use the alert color
- [ ] Right side shows the most imminent next run ("next: in 4m"), ticking down, hidden when nothing scheduled
- [ ] With zero loops in scope, the bar shows "No loops yet — ask to create one" instead of disappearing
- [ ] Unreachable instance shows "X loops — status unknown" (muted, not failed)
- [ ] Mock adapter continues to work (`pnpm dev:web`)
- [ ] `pnpm typecheck` passes
