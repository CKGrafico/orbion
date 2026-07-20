# Proposal: Agent interprets loop failures, not just displays them

## Change ID

gh-111-agent-loop-failure-diagnosis

## Summary

When a failed loop's card is summoned into the chat, the agent now produces a short diagnosis and recommended next step alongside the raw exit/logs. The heuristic distinguishes "the environment/target is down" from "the command itself is broken" when logs support it, using a local pattern-matching classifier that runs with zero latency.

## Problem

As a user looking at a failed loop, I currently see the raw metadata (exit code, interval, runs) and a log tail, but get no interpretation of *why* it failed. I have to scroll the logs myself and guess whether the target machine is unreachable or the command has a bug. The agent should provide a first-pass reading automatically.

## Solution

### Approach

1. **`diagnoseFailure()` — pure heuristic classifier**: Takes a `LoopMeta` and log tail string, returns a structured `FailureDiagnosis` with `category` (environment-down, command-broken, command-not-found, permission-denied, timeout, dependency-missing, unknown), `summary`, `nextStep`, and `confidence`. Pattern-matches log lines against ordered regex rules (most specific first: ECONNREFUSED → environment-down; "command not found" → command-not-found; "permission denied" → permission-denied; etc.). Falls back to exit-code heuristics (127 = not found, 126 = not executable, 137 = killed/OOM, 124 = timeout). Final fallback uses exit code + command context.

2. **`FailureDiagnosisRow` — new transcript row type**: Persists as a system message (id prefix `failure-diagnosis-`, role "user", content is JSON with diagnosis fields). Rendered in the chat stream as a compact panel right after the associated loop card.

3. **`FailureDiagnosisPanel` — React component**: Shows a category chip (blue for environment-down, amber for command errors), a 1-2 sentence diagnosis summary, a "Next →" next-step recommendation in monospace, and a 3-dot confidence indicator. Uses the existing warm-gray design language with subtle color tints.

4. **`insertFailureDiagnosis()` in useTranscript**: New function that persists a failure-diagnosis message. The `isSystemNoteMessage` parser recognizes `failure-diagnosis-*` IDs; `parseFailureDiagnosisMessage()` hydrates them on reload. The `buildRowsFromTurns` function interleaves them by timestamp (1ms after the parent loop-summon for ordering).

5. **Auto-diagnosis on segment click**: The `handleSegmentClick` callback in `SessionChatView` now also calls `diagnoseAndInsert()` for any failed loops in the summon. This fetches the log tail via `fetchLogs()`, runs `diagnoseFailure()`, and inserts the diagnosis row asynchronously.

6. **i18n**: Full diagnosis keys for all 7 categories, per-pattern summaries and next steps.

### Persistence model

Failure-diagnosis messages use the convention: `id` starts with `failure-diagnosis-{summonTimestamp}-{loopId}`, `role: "user"`, content is JSON `{ kind: "failure-diagnosis", loopId, environmentId, category, summary, nextStep, confidence }`. They are recognized by `isSystemNoteMessage()` and excluded from chat-turn pairing.

### Scope

- **Files changed/added**: `diagnoseFailure.ts` (new), `FailureDiagnosisPanel.tsx` (new), `types.ts` (FailureDiagnosisRow + RowKind), `useTranscript.ts` (insertFailureDiagnosis + parse/build), `SessionChatView.tsx` (auto-diagnose wiring), `theme.css` (diagnosis panel styles), `en.json` (diagnosis i18n keys)
- **No new IPC channels**: Uses existing `fetchLogs()` API and `transcript:appendMessage` for persistence
- **No new services**: All logic is renderer-side
- **Mock adapter works unchanged**: `fetchLogs()` works in mock mode; the heuristic is pure

## Acceptance Criteria

- [x] When a failed loop's card is summoned, the agent produces a short diagnosis and next step in chat
- [x] It distinguishes "the environment/target is down" from "the command itself is broken" when logs support it
- [x] Diagnosis categories cover: environment-down, command-broken, command-not-found, permission-denied, timeout, dependency-missing, unknown
- [x] Diagnosis is persisted and survives transcript reload
- [x] The mock adapter works with the feature (no special setup needed)
- [x] `pnpm typecheck` passes for renderer code (no new errors)
