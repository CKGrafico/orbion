# Chain Branch Visuals Spec

## Overview

The task chain view must show on-success vs. on-failure branching semantics clearly, while keeping linear chains visually simple.

## Chain resolution

The `resolveTaskChain` function produces a flat list of `ChainStep` objects. Each step has:

- `task`: the task definition
- `stepNumber`: 1-based display number
- `branchType`: `"success"` | `"failure"` | `null` -- null for the root step and subsequent main-chain steps that are not explicitly branching from the previous
- `depth`: indent level (0 = main chain, 1 = branch)
- `parentHasBranch`: `true` if the parent step in the chain has both onSuccess and onFailure tasks (i.e. this step is part of a branch point)

## Rendering rules

1. **Linear chain (no branching):** When no step in the chain has `parentHasBranch`, render as a simple vertical flow with plain connectors and no markers/labels.

2. **Branch point:** When a step has `parentHasBranch === true`:
   - The on-success continuation gets an "ok" marker on its connector line (accent color, small "ok" text)
   - The on-failure branch gets a distinct connector (danger color) and "on failure" label

3. **Connector styles:**
   - Linear connector: thin vertical line, `var(--border-subtle)` color
   - On-success connector: thin vertical line with "ok" badge, `var(--success)` color
   - On-failure connector: thin vertical line, `var(--danger)` color with "on failure" text label

4. **Step numbering:** Continue sequentially across branches (1, 2, 3...) -- no separate numbering per branch.

5. **Depth/indent:** Branch steps (on-failure) are indented 20px from the main chain.
