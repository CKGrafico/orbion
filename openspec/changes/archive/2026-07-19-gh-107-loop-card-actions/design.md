## Context

Loop cards (`LoopCard.tsx`) are compact read-only surfaces rendered in the chat stream and detail views. They show status, interval, runs, exit code, next-run countdown, and a live log tail. The loop-task daemon exposes `POST /api/loops/:id/pause`, `/resume`, `/stop`, and `/trigger` endpoints. The daemon allowlist already permits pause, resume, and trigger — but not stop. The renderer's `api.ts` has no typed helpers for these mutations. The mock adapter (`MockServices.ts`) intercepts daemon API calls but doesn't handle per-loop POST actions.

All HTTP to the daemon runs through the main process via `api:request` IPC. The renderer is sandboxed. Existing pattern: `apiRequest<T>(env, path, method, body)` → `ApiService.request()` → IPC → main-process fetch → `{ ok, data }` envelope.

## Goals / Non-Goals

**Goals:**
- Add contextual action buttons on the loop card: Pause, Resume, Stop, Run Now.
- Respect loop state when deciding which actions are available (e.g. Resume only for paused, Stop for running/waiting/paused/failed).
- Confirm before destructive or interrupting actions (stop, and pause of a running loop).
- Reflect the action result promptly — refetch loop data after a successful mutation.
- Keep the mock adapter working so `pnpm dev:web` shows functional buttons.
- Add the stop endpoint to the daemon allowlist.

**Non-Goals:**
- No loop creation or editing from the card (that stays chat-driven per the design model).
- No batch actions (selecting multiple loops).
- No polling acceleration after an action — the existing ~5s poll cycle is sufficient.
- No undo/redo of actions.

## Decisions

### 1. Action bar placement: below the log tail, above card boundary

The action bar sits between the log tail and the bottom of the card, as a row of small pill buttons. This keeps the read surface (header + meta + log) intact and adds the write surface below. On cards without a log tail, the action bar follows the meta row directly.

Alternative considered: action buttons in the header row — rejected because the header already has the status dot, name, and status chip, and adding buttons would crowd it on narrow viewports.

### 2. Confirmation via inline overlay, not a modal dialog

A lightweight confirmation overlay renders inside the card's bounding box (semi-transparent backdrop + two buttons: confirm / cancel). This keeps the user's context — they see the loop data they're about to affect. A modal dialog would break the spatial relationship.

### 3. Action feedback via brief inline status text

After a successful action, a brief "Paused" / "Stopped" / "Triggered" status text replaces the action bar for ~2 seconds, then the card re-renders with fresh loop data from the next poll cycle. On error, the error message shows inline for ~4 seconds. No toast/notification — the card is already in view.

### 4. Availability rules derived from loop status

| Status   | Pause | Resume | Stop | Run Now |
|----------|-------|--------|------|---------|
| running  | ✅    | —      | ✅   | —       |
| waiting  | ✅    | —      | ✅   | ✅       |
| paused   | —     | ✅     | ✅   | ✅       |
| stopped  | —     | —      | —   | ✅       |
| failed   | —     | —      | ✅   | ✅       |
| finished | —     | —      | —   | —        |

Stop excludes running (hand edge case: a loop that is actively executing should be paused first, then stopped — matching the daemon's semantics where stop clears the schedule but doesn't kill a running process). For MVP, Stop is offered on running too, since the daemon's stop endpoint handles it.

### 5. Daemon allowlist: add stop path

`POST /api/loops/:id/stop` is added to `ALLOWED_API_OPERATIONS` alongside the existing pause/resume/trigger entries. A positive test is added to the allowlist test file.

### 6. Mock adapter: mutate in-memory loop status

When mock mode receives a POST to `/api/loops/:id/pause|resume|stop|trigger`, the mock mutates the matching loop's status in `MOCK_LOOPS` and returns `{ ok: true }`. The next poll cycle picks up the change.

### 7. API helpers in api.ts

Four new exported functions: `pauseLoop`, `resumeLoop`, `stopLoop`, `triggerLoop`. Each takes `(env: Environment, loopId: string)` and calls `apiRequest` with `POST`.

## Risks / Trade-offs

- **[Race on rapid double-clicks]** → Debounce action buttons for 1s after a click; disable them while the request is in flight (`loading` state).
- **[Stale data during poll gap]** → The ~5s poll means the card may briefly show the old status after an action. The inline status text bridges this gap.
- **[Stop kills the schedule]** → The confirmation dialog explicitly states "schedule will be cleared" so users understand the difference from pause.
- **[Mock state is in-memory only]** → Refreshing the page resets mock loop states. This is acceptable for dev mode.
