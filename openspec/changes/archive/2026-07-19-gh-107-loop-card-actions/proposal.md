## Why

Loop cards in the chat stream and loop detail view are read-only surfaces. Users need to act on loops directly from the card — pause (keeps schedule), stop (clears schedule), and trigger a run-now — without dropping to the CLI or switching context. Resume must be offered when a loop is already paused. Destructive actions (stop, which clears the schedule) must confirm first.

## What Changes

- Add action buttons to `LoopCard` component: **Pause** (for running/waiting), **Resume** (for paused), **Stop** (for running/waiting/paused/failed), and **Run Now** (for any non-running state when reachable).
- Wire `apiRequest` POST calls to the daemon's `POST /api/loops/:id/pause`, `POST /api/loops/:id/resume`, `POST /api/loops/:id/stop`, and `POST /api/loops/:id/trigger` endpoints.
- Add confirmation dialog for interrupting/destructive actions (stop, pause on a running loop, trigger on a stopped loop).
- Show an inline action-result feedback (brief toast or status change) after the daemon responds.
- Refresh the loop data promptly after a successful action.
- Add i18n keys for all new UI strings.
- Add mock adapter support for the four new POST endpoints so `pnpm dev:web` works.
- Add the `POST /api/loops/:id/stop` path to the daemon allowlist (pause/resume/trigger already exist).

## Capabilities

### New Capabilities
- `loop-card-actions`: Action buttons on loop cards that call the daemon's pause/resume/stop/trigger endpoints, with confirmation for destructive actions and prompt UI refresh.

### Modified Capabilities

## Impact

- `src/renderer/src/components/LoopCard.tsx` — major changes (action bar UI, handlers, confirmation)
- `src/renderer/src/api.ts` — new API functions (pauseLoop, resumeLoop, stopLoop, triggerLoop)
- `src/renderer/src/theme.css` — new styles for action buttons and confirmation overlay
- `src/renderer/src/i18n/en.json` — new i18n keys for action labels, confirmations, and results
- `src/renderer/src/services/mock/MockServices.ts` — mock handler for new loop-action POST requests
- `src/shared/daemon-allowlist.ts` — add stop path to allowlist
- `src/shared/__tests__/daemon-allowlist.test.ts` — positive test for stop allowlist entry
