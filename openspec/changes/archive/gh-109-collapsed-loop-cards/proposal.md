# Change: Scrolled-past loop cards collapse to a one-line live reference

## Issue

GitHub #109 — As a user, I don't want scrollback filling with stale full-size cards — old cards should shrink to a live one-liner I can re-expand.

## Problem

Loop cards in the chat stream (`LoopCard` component rendered via `LoopCardRow` in `SessionChatView`) always display at full size: header row + meta row + log tail + action buttons. As a conversation accumulates loop cards (e.g. clicking loop-summary-bar segments), the scrollable area grows rapidly with cards the user has already read. There is no mechanism to collapse scrolled-past cards back to an ambient one-line reference while keeping them live.

## Solution

Introduce an **auto-collapse** behavior: when a loop card scrolls out of the viewport (above the visible area), it collapses to a single line showing **status dot + loop name + current status text**. This one-liner stays **live** — it reads the current `loop` and `reachability` props so the status dot and text update in real time with polled data. Clicking the collapsed one-liner **re-expands** the full card in place. Cards that are still in the viewport remain fully expanded.

### Design decisions

1. **IntersectionObserver with `rootMargin` shift** — The existing `LoopCard` already uses an IntersectionObserver for visibility-gated SSE subscriptions. We extend this to detect when a card is scrolled **above** the viewport (i.e., its bottom edge is above the scroll container's top edge). This distinguishes "scrolled past" from "not yet scrolled to" (below the viewport), which is important: cards below the fold should still render expanded so they appear fully when the user scrolls down.

2. **Collapse state is local to the component** — No transcript-level state change is needed. The collapsed/expanded toggle is internal to each `LoopCard` instance, driven by scroll position. This avoids persistence complexity and keeps the card's visual state purely derived from its viewport position.

3. **One-liner format**: `● LoopName — running` — The status dot (8px, colored by status palette, pulsing for running), the loop name (truncated with ellipsis), a thin separator (em dash), and the current status label. This mirrors the header row of the full card but strips the meta row, log tail, and actions.

4. **Click to re-expand** — Clicking the collapsed one-liner scrolls the card into the viewport center and expands it, so the user gets the full card with log tail and action buttons.

5. **No persistence** — Collapse state is transient; reopening a session shows all cards expanded until they scroll out of view again. This matches the existing "live reference" model where cards always reflect current state.

6. **CSS-only visual transition** — Per DESIGN.md, motion is minimal. The collapse is an instant layout swap with no CSS transition, consistent with the existing design language.

7. **SSE streams are already gated** — The existing IntersectionObserver already toggles SSE subscriptions based on visibility. Collapsed cards (scrolled above viewport) will unsubscribe from streams; re-expanding re-subscribes. No new SSE logic needed.

## Scope

- `LoopCard.tsx` — Add `isScrolledPast` state + collapsed rendering branch
- `SessionChatView.tsx` — Pass scroll container ref to `LoopCard` for IntersectionObserver root
- `theme.css` — Add `.loop-card--collapsed` styles for the one-line view
- `en.json` — Add i18n key for the collapsed separator text (em dash, no new key needed since status labels exist)
- `types.ts` — No changes needed (LoopCardRow already has the right shape)

## Out of scope

- Persisting collapse state in the transcript
- Adding collapse/expand controls outside the card (e.g. a sidebar toggle)
- Modifying the transcript store or useTranscript hook
- Changing how loop cards are summoned (insertLoopCards stays the same)
