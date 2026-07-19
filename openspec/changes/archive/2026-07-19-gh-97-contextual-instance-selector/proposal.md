# Contextual Instance Selector

## Issue
GitHub #97 — Contextual instance selector: only instances that have this project

## Problem
The chat header currently has no instance selector. When a user is in a chat session filed under a project, they need to switch which instance (VM) the chat is pointing at, but the dropdown must only show instances that actually contain that project, with enough context (directory path, loop count) to tell apart two unrelated same-name projects.

## Solution
Add an `InstanceSelector` component to the session chat header (peer of the AgentRuntimeSwitcher, ModelSelector, ReasoningEffortSelector). It:
1. Takes the current session's `projectName` and filters environments to only those whose `perEnvProjects` data includes a project of that name.
2. Each dropdown row shows: connection health dot, instance name, the project's directory path (from loop cwd), and loop count for that project on that instance.
3. The current home instance is marked with a star/highlight.
4. Selecting a different instance switches the session's `environmentId` in place (does NOT move the session in the sidebar).

## Scope
- New component: `src/renderer/src/components/InstanceSelector.tsx`
- New i18n keys under `instanceSelector.*`
- Wire into `App.tsx` session header rendering
- New CSS styles for the dropdown
- Mock adapter naturally works (uses same perEnvProjects / perEnvLoops data)
