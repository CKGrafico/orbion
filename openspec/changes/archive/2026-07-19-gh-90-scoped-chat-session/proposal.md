# Change: Scoped chat session — home = project × instance, with header title and directory

**Issue:** #90
**Slug:** `gh-90-scoped-chat-session`

## Problem

Chat sessions are currently filed by `projectName` only, with no awareness of which instance they run on or what working directory the agent operates in. When a user opens a project, there is no mechanism to start/resume a session homed to that project on a specific instance, and the chat header provides no contextual anchoring (project name, color bullet, working directory). The agent effectively runs "nowhere" and the user has no visual confirmation of scope.

## Proposed Change

Extend `ChatSession` with an **environmentId** (the instance this session is homed to) and a **workingDirectory** (the project's directory on that instance, derived at session-creation time from the project's loops' `cwd` or set explicitly). When a user opens a project in the sidebar, Orbion starts or resumes a session homed to that project on a default instance that contains it. The session header then shows: the project's color bullet, project name, and working directory in muted monospace — updating reactively if the home scope changes.

## Acceptance Criteria

1. `ChatSession` carries `environmentId` and `workingDirectory` fields alongside the existing `projectName`.
2. Clicking a project in the sidebar creates or resumes a session homed to that project on the first instance that has it.
3. The session header shows the project's color bullet, project name, and working directory (muted monospace), updating if the scope changes.
4. Mock adapter continues to work — mock sessions include `environmentId` and `workingDirectory`.
5. IPC contract, validation, config-store, and renderer services are all updated coherently.
6. No new top-level nav/tab/page — the change routes through existing surfaces (sidebar + session header).

## Scope

- **In scope:** Session model extension, session-creation/resume logic when opening a project, session header rendering with project context.
- **Out of scope:** Instance selector in the header (separate issue), agent/model/reasoning knobs (separate issue), moving sessions between projects, un-homing sessions to fleet tier.
