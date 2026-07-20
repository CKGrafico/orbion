# gh-114: Show on-success / on-failure branching in the chain

## Problem

The current `TaskChainView` resolves the task chain linearly: it walks the on-success path as the "main" chain and appends on-failure branch steps at depth=1 with a red "on failure" label. This conflates all steps into a flat list with a simple depth indent, which fails to convey the branching semantics visually. The "ok" marker for on-success is never shown; branches lack distinct connector styling; and the linear-first rule (simple vertical flow when no branches exist) is not enforced.

## Proposal

Redesign the task chain rendering so that:

1. **On-success steps are connected with an "ok" marker** between the connector line and the step row, making the success path visually explicit.
2. **On-failure branches are visually distinct** from on-success branches: they use a different connector color and label, clearly separating the two paths.
3. **Linear chains render as a simple vertical flow** with no "ok" markers or branch labels; branch visuals appear only when a task actually has both `onSuccessTaskId` and `onFailureTaskId` (i.e. when branches exist).
4. **The `resolveTaskChain` algorithm is restructured** to produce a tree-like structure where each step can explicitly declare its branch type, and the main chain is cleanly separated from failure branches.

### Acceptance criteria (from issue #114)

- On-success steps connect with an "ok" marker; on-failure branches are visually distinct.
- Linear chains render as a simple vertical flow; branch visuals appear only when branches exist.

## Scope

| Layer | Change |
|-------|--------|
| Renderer `TaskChainView.tsx` | Rewrite `resolveTaskChain` to produce structured chain with explicit branch types; rewrite `TaskChainView` and `TaskChainStep` to render "ok" markers for on-success connectors and distinct on-failure visuals; suppress branch markers in linear chains |
| Renderer `theme.css` | Add `.task-chain-connector--ok` style with accent color + ok label; add `.task-chain-connector--fail` style with danger color; update `.task-chain-branch-label` for on-failure; hide branch labels and ok markers when chain is linear |
| Renderer `i18n/en.json` | Add `taskChain.ok` key for the "ok" marker |

## What this does NOT change

- No changes to `TaskDefinition` type or API layer
- No changes to `LoopCard` (it passes steps to `TaskChainView` as before)
- No changes to IPC/main process (purely renderer)
- No changes to the mock adapter
