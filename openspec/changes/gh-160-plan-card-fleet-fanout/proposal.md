# Plan card with per-target approval for fleet fan-out

## Problem

When a user issues a fleet-wide action (e.g. "add test-watch to all Node projects"), the agent currently has no structured way to present the list of resolved targets before executing. Fleet fan-out from a bare sentence is dangerous: targets may include instances the user did not intend, and there is no way to selectively skip targets.

## Proposal

Introduce a **FleetPlanCard** component rendered in the chat stream. When the agent proposes a fleet-wide action, this card:

1. **Resolves targets** into a list of `(project x instance)` tuples, each showing the concrete operation.
2. **Renders checkboxes** (default checked) for each target, so the user can deselect any they want to skip.
3. **Shows a single "Apply to N selected" button** that executes only the checked targets.
4. **Reports per-target results** (ok / failed) back on the card after execution, updating each target row inline. Unchecked targets are untouched.

This follows the existing pattern of proposal cards (`LoopProposalCard`, `ChainEditProposalCard`, `SiblingOfferCard`) already in the chat stream, and enforces the design rule that "fleet fan-out must present a plan card before anything runs, never from a bare sentence."

## Acceptance criteria

- The plan renders as a card: every resolved target (project x instance) with a checkbox (default checked) and the concrete operation shown; one "Apply to N selected" executes only checked targets.
- Per-target results (ok/failed) are reported back on the card; unchecked targets are untouched.
- The card persists state across re-renders and transcript reloads.
- No new top-level navigation; the card is a chat stream row.

## Scope

- Renderer only (no new IPC channels needed; the card calls existing services).
- Adds a new `fleet-plan` row kind to the transcript types.
- Adds `FleetPlanCard` component following existing card conventions.
- Adds i18n keys for all user-facing text.
- Adds CSS for the card in `theme.css`.
- Mock adapter support for browser-only dev.
