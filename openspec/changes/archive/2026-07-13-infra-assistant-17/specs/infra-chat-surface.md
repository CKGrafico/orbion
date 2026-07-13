# Spec: Infra Chat Surface

## Placement

The infra chat panel appears in the sidebar, below the environment list, as a **pinned section** with the label "Infrastructure". It is only visible when a main-vm environment exists and its infra OpenCode is connected.

## Visual identity

- Panel has a left border accent in amber (`#e8a24e`) to distinguish it from coding chats.
- Title bar shows an infrastructure icon and "Infrastructure" label.
- Avatar badge uses "INF" instead of the user/assistant avatar.
- The composer placeholder reads "Ask about your fleet…" instead of "Send a prompt…".

## Isolation

- Infra chat sessions are stored in a separate state key (`infraTurns`) in the React component — never in the coding session's transcript.
- The infra chat uses its own `TranscriptView` instance, its own `useTranscript()` hook, and its own `ChatComposer`.
- Coding VM chat sessions never show infra turns and vice versa.

## Data flow

1. User types a prompt in the infra composer.
2. The prompt is sent via `infra:executeAction` IPC channel (for now, this talks to the infra OpenCode runtime on the main-vm).
3. The response streams back through the same transcript view architecture (addTurn → appendAssistantContent → finishTurn).

## Actions

The infra chat can execute these admin-scoped operations on the main-vm daemon:

| Action | Daemon API | Description |
|--------|-----------|-------------|
| machine-status | `GET /api/loops` (probe all environments) | Health report of all connected VMs |
| clone-repo | `POST /api/loops` with a task that clones | Clone a git repo on a chosen VM |

For the MVP, these are routed through the existing API proxy (`api:request`) with the main-vm's admin-scoped session token.
