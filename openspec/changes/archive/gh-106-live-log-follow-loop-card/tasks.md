# Tasks: Live log follow on the loop card via SSE

## Change ID

gh-106-live-log-follow-loop-card

### Task 1: Add live log streaming and autoscroll to LoopCard

- **Tier**: build
- **Agent**: frontend-engineer
- **Depends on**: —
- **Touches**: `src/renderer/src/components/LoopCard.tsx`
- **Description**: Replace the static `fetchLogs`-based log tail in `LoopCard` with live SSE streaming using the existing `useLiveLog` hook. Keep the initial tail fetch as a seed, then append live lines. Add autoscroll behavior: auto-scroll to bottom on new lines unless the user has manually scrolled up. Cap in-memory lines at 50 for the compact card view. Show a live indicator dot when the stream is connected.
- **Verification**: `pnpm typecheck` passes.

### Task 2: Add visibility-gated subscription with IntersectionObserver

- **Tier**: build
- **Agent**: frontend-engineer
- **Depends on**: Task 1
- **Touches**: `src/renderer/src/components/LoopCard.tsx`
- **Description**: Wrap the SSE log subscription with an `IntersectionObserver` so the subscription is only active while the card is in the viewport. When the card scrolls out of view, stop the live subscription. When it scrolls back in, reconnect. Pass the visibility state into `useLiveLog` to control start/stop. Preserve the existing static tail fetch as a fallback so the card always shows something even when not actively streaming.
- **Visibility**: The `useLiveLog` hook's `stop()` and `reconnect()` methods are the natural API for this.
- **Verification**: `pnpm typecheck` passes.

### Task 3: Add CSS styles for live indicator and smooth scroll

- **Tier**: fast
- **Agent**: frontend-engineer
- **Depends on**: Task 1
- **Touches**: `src/renderer/src/theme.css`
- **Description**: Add CSS for the live-streaming indicator dot (pulsing green) next to the "Output" label in the log tail header, and `scroll-behavior: smooth` on the log content area. The live dot is only shown when the stream is connected.
- **Verification**: `pnpm typecheck` passes.

### Task 4: Add i18n keys for live stream status

- **Tier**: fast
- **Agent**: frontend-engineer
- **Depends on**: Task 1
- **Touches**: `src/renderer/src/i18n/en.json`
- **Description**: Add i18n keys for the live stream status indicator: `loopCard.live`, `loopCard.disconnected`.
- **Verification**: `pnpm typecheck` passes.

### Task 5: Verify typecheck and mock mode

- **Tier**: fast
- **Agent**: frontend-engineer
- **Depends on**: Task 1, Task 2, Task 3, Task 4
- **Touches**: —
- **Description**: Run `pnpm typecheck` and verify the mock adapter's `MockStreamService` still works with the new subscription pattern. The mock already emits synthetic log lines; confirm they appear live on the card in `pnpm dev:web`.
- **Verification**: `pnpm typecheck` passes.
