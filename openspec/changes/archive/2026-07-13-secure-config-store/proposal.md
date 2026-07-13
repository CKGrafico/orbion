# Secure Config Store

## Goal

Move instance config from renderer `localStorage` to main-process `electron-store`; add `safeStorage` wrapper; extend IPC contract; one-time migration of v1 localStorage keys.

## Problem

1. `localStorage` lives in the renderer — exposed to any JS that runs there (XSS surface).
2. No encryption-at-rest path exists for the day we need to store secrets.
3. The hand-rolled `useInstances` hook has no migration story beyond a `.v1` key suffix and no cross-window sync.

## Solution

1. Move instance config out of `localStorage` → main process via `electron-store`
2. Add `safeStorage` wrapper now, encrypt nothing yet
3. Keep `window-bounds.json` as-is

## Scope

- Add `electron-store` dependency
- Move `Instance[]` + selected id from renderer `localStorage` to main-process store
- Extend IPC contract with typed config channels
- Update preload bridge + renderer `store.ts` to consume via IPC
- Add `safeStorage` wrapper module (no encryption call sites yet)
- Migrate existing `.v1` localStorage keys on first launch
- Update `ARCHITECTURE.md` and `project-guardrails`

## Non-goals

- Implementing secrets/auth
- Adding a database or ORM
- Persisting domain data locally
