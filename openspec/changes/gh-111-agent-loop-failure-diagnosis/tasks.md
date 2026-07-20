# Tasks: Agent interprets loop failures, not just displays them

## Change ID

gh-111-agent-loop-failure-diagnosis

## Tasks

- [x] 1.1 Create `diagnoseFailure.ts` with pure heuristic classifier (log pattern rules, exit-code heuristics, fallback logic) <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/chat/diagnoseFailure.ts] -->
- [x] 2.1 Add `FailureCategory` type, `FailureDiagnosisRow` interface, and `failure-diagnosis` row kind to `types.ts` <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/chat/types.ts] -->
- [x] 3.1 Add `isFailureDiagnosisMessage`, `parseFailureDiagnosisMessage` helpers to useTranscript <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/chat/useTranscript.ts] -->
- [x] 3.2 Update `buildRowsFromTurns` to accept and render `failureDiagnosisMessages` as `FailureDiagnosisRow` entries <!-- agent: frontend-engineer.build, depends_on: [3.1], touches: [src/renderer/src/chat/useTranscript.ts] -->
- [x] 3.3 Add `insertFailureDiagnosis` function and `failureDiagnosisMessages` state to `useTranscript` hook <!-- agent: frontend-engineer.build, depends_on: [3.2], touches: [src/renderer/src/chat/useTranscript.ts] -->
- [x] 4.1 Create `FailureDiagnosisPanel.tsx` component (category chip, summary, next step, confidence indicator) <!-- agent: frontend-engineer.build, depends_on: [2.1], touches: [src/renderer/src/components/FailureDiagnosisPanel.tsx] -->
- [x] 5.1 Wire auto-diagnosis in `SessionChatView` (handleSegmentClick → diagnoseAndInsert for failed loops, render FailureDiagnosisRow) <!-- agent: frontend-engineer.build, depends_on: [3.3, 4.1], touches: [src/renderer/src/components/SessionChatView.tsx] -->
- [x] 6.1 Add CSS styles for `.failure-diagnosis-panel`, `.failure-diagnosis-panel--env-down`, and related elements <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/renderer/src/theme.css] -->
- [x] 7.1 Add i18n keys for diagnosis categories, summaries, next steps, and UI labels <!-- agent: frontend-engineer.fast, depends_on: [], touches: [src/renderer/src/i18n/en.json] -->
- [x] 8.1 TypeCheck verification — all renderer code compiles cleanly (no new errors) <!-- agent: frontend-engineer.fast, depends_on: [5.1, 6.1, 7.1], touches: [] -->
