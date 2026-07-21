# gh-301: Sanitize submit-pr-review body before passing to CLI

## Problem

`handleSubmitPrReview` passes the `body` parameter directly to `gh pr review --body <body>` and `az repos pr set-vote --comment <body>` without calling `sanitizeText()` or `validateCliInputs()`. This contradicts the pattern established by `create-issue` and `edit-issue`, which both sanitize title/body and validate labels/repo before CLI invocation.

While `execFile` prevents shell injection, unsanitized control characters (null bytes, newlines, tabs) can corrupt the review comment on GitHub, confuse downstream parsing, and violate the defense-in-depth principle from issue #191.

## Solution

1. Apply `sanitizeText()` to the `body` param in `handleSubmitPrReview` before passing to either `gh` or `az` CLI.
2. Move `validateCliInputs({ repo })` before the CLI branch (it already exists for `gh` but not for `az`).
3. Pass sanitized body to both `--body` (gh) and `--comment` (az) paths.

## Affected files

- `src/main/infra-handlers.ts` — `handleSubmitPrReview` (lines ~336-415)

## Acceptance criteria

- `body` is sanitized via `sanitizeText()` before being pushed to `ghArgs` or `azArgs`
- `validateCliInputs({ repo })` runs before CLI branching (covers both gh and az)
- Empty string after sanitization does not push `--body` / `--comment`
- Existing tests pass, `pnpm typecheck` passes
- New test covers the sanitization in `handleSubmitPrReview`
