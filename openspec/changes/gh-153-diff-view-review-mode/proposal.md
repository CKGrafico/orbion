# gh-153: Diff view in review mode

## Summary

Add a per-file diff viewer to the PR review mode overlay so that users can read a selected PR's changed files (file list) and unified per-file diffs with add/remove coloring. Large diffs load per-file on demand; binary files are labeled, not rendered. The data is fetched via `gh pr diff` through the existing infra action pipeline, and rendered in the review mode main area.

## Motivation

The review mode overlay currently shows only a placeholder ("The agent briefing, diff viewer, and review actions will appear here in a future update."). The issue explicitly asks for diff reading capability inside review mode — the core value of a PR review surface.

## Design

### New infra action: `get-pr-diff`

A new `InfraAction` value `"get-pr-diff"` fetches the raw unified diff for a PR via `gh pr diff <number> --repo <repo>`. The main process handler calls `execFile("gh", ["pr", "diff", ...])` and returns the raw diff string. Per-file fetching is done by also supporting `gh pr diff <number> --repo <repo> -- <path>` for on-demand loading of individual files.

### New types in `shared/ipc.ts`

- `GetPrDiffParams { repo: string; number: number; path?: string }` — optional `path` for per-file on-demand loading.
- `GetPrDiffResult { diff: string; files: DiffFileEntry[]; truncated: boolean }` — parsed diff with file entries.
- `DiffFileEntry { path: string; additions: number; deletions: number; isBinary: boolean }` — file summary with stats.

### Diff viewer component: `ReviewDiffView`

Replaces the placeholder in `ReviewModeOverlay.tsx`. Shows:

1. **File list sidebar** — A compact vertical list of changed files with add/remove line counts, colored indicators. Clicking a file loads its diff.
2. **Unified diff pane** — Renders the selected file's unified diff with line numbers and add/remove coloring (green for additions, red for removals, neutral for context).
3. **Binary file label** — Binary files show "Binary file" badge instead of diff content.
4. **On-demand loading** — Only the file list is loaded initially; per-file diffs are fetched on click via `get-pr-diff` with `path` parameter.
5. **Truncation handling** — Large diffs are truncated; a banner indicates this.

### Diff parsing (renderer-side)

A new pure utility `src/renderer/src/features/review/parse-diff.ts` that:
- Splits a full unified diff into per-file sections
- Extracts file paths from `diff --git a/... b/...` and `--- a/...` / `+++ b/...` headers
- Counts additions/deletions per file
- Detects binary files (`Binary files ... differ`)
- Returns a structured `DiffFileEntry[]` for the file list

### Mock counterpart

`MockInfraService` returns a realistic synthetic diff string for `get-pr-diff`, including multiple files with additions, deletions, binary files, and rename entries. This ensures `pnpm dev:web` works without `gh`.

### i18n

New keys under `reviewMode.diffView.*` for:
- File list headers ("Files changed", "Additions", "Deletions")
- Binary file label ("Binary file")
- Loading state ("Loading diff...")
- Error state ("Failed to load diff")
- Truncation banner ("Large diff — some lines omitted")

### Styling

Follows the existing theme: `bg_log` dark terminal surface for diff content, `--success`/`--danger` for add/remove line highlighting, monospace font, hairline borders. File list uses the established drawer/chip visual language.

## Tasks

1. Add `get-pr-diff` infra action to `InfraAction` type union and new types to `shared/ipc.ts`
2. Implement main-process `handleGetPrDiff` handler calling `gh pr diff`
3. Add `parseDiffIntoFiles` utility in renderer
4. Create `ReviewDiffView` component (file list + diff pane)
5. Wire `ReviewDiffView` into `ReviewModeOverlay` replacing the placeholder
6. Add i18n keys for diff view strings
7. Add CSS for diff viewer in `theme.css`
8. Add mock handler for `get-pr-diff` in `MockInfraService`
9. Verify `pnpm typecheck` passes

## Out of scope

- Agent briefing / inline flagged hunks (would require LLM integration)
- Approve / request-changes as chat-style verbs (separate issue)
- Cross-PR conflict / duplicate detection (separate issue)
