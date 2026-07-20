# Change: Extract gh-exec helper and split index.ts god-file

## Summary

`src/main/index.ts` (2342 lines) contains all IPC handler registrations, CLI orchestration logic, PR diff parsing, issue/PR/review command handlers, platform detection, and supervisor wiring in a single file. This violates the project guardrail: "one responsibility per file, no god-files."

## Problem

- ~300 lines of `execFile("gh", args) → ENOENT check → error mapping` boilerplate repeated ~10 times
- Security-relevant changes hard to review amid 2000+ unrelated lines
- Frequent merge conflicts when multiple maintainers touch this file
- Score 9/10 during deep audit (impact 3/4, pattern 4/4, safety 2/4)

## Approach

1. Extract `src/main/gh-exec.ts` helper: resolve CLI, validate inputs, execFile, ENOENT mapping, error formatting. Each handler collapses to ~5 lines of arg-building + `ghExec()` call.
2. Extract `src/main/infra-handlers.ts` containing all action handlers (create-issue, add-label, edit-issue, bulk-relabel, list-issues, list-prs-awaiting-review, get-pr-verdict, get-pr-diff, get-pr-briefing, submit-pr-review, open-pr-in-browser, detect-platform, clone-repo, machine-status).
3. Move `parseDiffFiles()` into `src/main/diff-analyzer.ts` (already has similar `parseDiffPerFile()`).
4. Move `detectPlatform()` + `platformCache` + `platformCacheKey()` into `src/main/platform-classifier.ts` (already exists).
5. Move CLI sanitization helpers (`validateLabels`, `validateRepo`, `sanitizeText`, `validateCliInputs`, regexes) into `src/main/gh-exec.ts` alongside the exec helper.
6. Leave `index.ts` with: app lifecycle, window creation, supervisor seeding, safeHandle registrations (thin delegates to extracted modules).

**Target:** `index.ts` under 400 lines.

## Files Affected

- `src/main/index.ts` (2342 → ~380 lines)
- New: `src/main/gh-exec.ts`
- New: `src/main/infra-handlers.ts`
- Modified: `src/main/diff-analyzer.ts` (add `parseDiffFiles`)
- Modified: `src/main/platform-classifier.ts` (add `detectPlatform`, `platformCache`, `platformCacheKey`)

## Risk

Low. Pure extraction, no logic changes. All moved functions keep same signatures. typecheck catches any broken import.
