# Conversational inbox: ask questions with fleet reach

## Change ID

conversational-inbox

## Source

GitHub Issue #132 - "Conversational inbox: ask questions with fleet reach"

## Description

Make the Orbion inbox conversational: users can ask natural-language questions
("what needs me this morning?") and get answers computed across the whole
fleet. The inbox gains a composer for queries; answers reference specific
loops/items with clickable links that open them. Any fleet-scoped action
naming its targets follows the existing cross-scope rules.

## Acceptance criteria

1. The inbox includes a text composer; typing a question and pressing Enter
   runs a fleet-scoped query (all reachable instances' data + current
   notifications/breaches).
2. Answers are rendered as markdown in the inbox and reference specific
   items (loops, breaches, instances) with links that navigate to them.
3. Any actions suggested in the answer must name their targets
   (cross-scope rules from design model).
4. The inbox panel is accessible from the sidebar (replacing the current
   BreachInbox which only showed budget breaches).
5. Mock adapter works for browser-only dev.

## Design notes

- The inbox becomes a dedicated panel (`InboxPanel`) in the sidebar area,
  shown above the existing Sidebar component, replacing `BreachInbox`.
- It aggregates: budget breaches, failed loops across instances, and
  pending approvals/questions from chat turns.
- The composer reuses the `ChatComposer` pattern from `InfraChatPanel` but
  simplified (no access mode chips, just a text input + send).
- Fleet queries compute a summary from `perEnvLoops`, `environments`,
  `health`, `fleetStatus`, and `budgetWatch.breaches`.
- Answers are generated locally (no LLM call) by the `InboxQueryEngine`,
  a pure function that formats structured data into readable markdown.
- Clicking a referenced item navigates to it (selects the environment,
  opens the loop/project view).
