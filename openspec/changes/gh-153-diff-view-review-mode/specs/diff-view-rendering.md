# Diff view rendering spec

## Overview

The `ReviewDiffView` component renders a PR's changed files and unified diffs in the review mode main area.

## Data flow

1. On mount, `ReviewDiffView` calls `infra.executeAction({ action: "get-pr-diff", params: { repo, number } })` to get the full diff.
2. The raw diff string is parsed by `parseDiffIntoFiles()` into `DiffFileEntry[]` for the file list.
3. When a file is selected, if per-file diff not yet loaded, call `infra.executeAction({ action: "get-pr-diff", params: { repo, number, path: filePath } })` to get just that file's diff.
4. The diff is rendered with colored lines in a scrollable monospace container.

## Component structure

```
ReviewDiffView
├── DiffFileList (left column)
│   ├── DiffFileItem (per file: path, +N/-N, binary badge)
│   └── ...
└── DiffContentPane (right column)
    ├── DiffFileHeader (selected filename, stats)
    ├── DiffLines (scrollable)
    │   ├── DiffLine (context: neutral)
    │   ├── DiffLine (added: green bg)
    │   ├── DiffLine (removed: red bg)
    │   └── DiffLineHunkHeader (@@ ... @@ header: muted)
    ├── BinaryFileLabel (for binary files)
    └── DiffLoadMore (if truncated)
```

## Parsing

The `parseDiffIntoFiles` utility handles:
- `diff --git a/path b/path` → file path
- `Binary files ... differ` → isBinary: true
- `@@ -a,b +c,d @@` → hunk headers
- `+text` → additions
- `-text` → deletions
- ` text` → context lines

## On-demand loading

- Initial load: full diff via `gh pr diff` (for file list parsing)
- Per-file selection: `gh pr diff -- <path>` (for large repo efficiency)
- Cache loaded diffs in component state keyed by file path

## Binary files

Binary files render a "Binary file" badge in the content pane instead of diff lines. The file list shows them with a file icon and "binary" label.

## Color scheme

- Addition lines: `rgba(169, 217, 92, 0.12)` background, `var(--success)` text
- Deletion lines: `rgba(255, 132, 132, 0.12)` background, `var(--danger)` text
- Hunk headers: `var(--bg-hover)` background, `var(--text-muted)` text
- Context lines: transparent background, `var(--text-secondary)` text
- Line numbers: `var(--text-muted)`, right-aligned gutter
