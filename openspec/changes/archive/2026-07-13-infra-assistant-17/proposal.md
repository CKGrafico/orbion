# Infra Assistant on the Main VM

## Why

Two different kinds of AI conversations are emerging: working on a repo inside a VM, and managing the fleet itself (create a VM, install tooling, check health, clone a repo). Mixing fleet management into a coding session pollutes its context and history. They need separate runtimes.

## What

The first environment the user adds becomes the **main VM**. It hosts a second, internal OpenCode runtime dedicated to infrastructure work, isolated from the user's coding sessions: own state dir, own sessions, never listed among coding threads.

The infra assistant gets its own chat surface with a distinct visual identity so it cannot be confused with a repo chat.

Its toolset is fleet operations delegated to the daemons: machine status, service restart, repo clone, OpenCode install and update. It edits no repos.

Conversations like "create a new instance for project X" or "why did the nightly loop on VM 3 fail" happen here.

## Implementation notes

- Model it as one more environment entry with a `role` flag; everything downstream (supervisor, chat) already works on environments.
- Scope its daemon token to admin operations; coding-session tokens do not get those scopes.

## Acceptance criteria

- [ ] The infra chat exists, visually distinct, pinned outside the per-project thread list
- [ ] Infra sessions never appear inside any coding VM's session list, and vice versa
- [ ] At least two operations work end to end (machine status report, cloning a repo on a chosen VM)
- [ ] Removing the main VM prompts the user to pick a new one
