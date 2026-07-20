# Briefing rendering spec

## Overview

The `ReviewBriefingView` replaces `ReviewDiffView` as the default view in the PR review mode main area. It shows an agent briefing with flagged hunks inline and boilerplate collapsed, with a one-click toggle to the raw diff.

## Data flow

1. When the review mode overlay opens, `ReviewModeContent` renders `ReviewBriefingView` by default.
2. `ReviewBriefingView` calls `infra.executeAction({ action: "get-pr-briefing", params: { repo, number } })` to get the structured briefing.
3. The briefing result contains sections: flagged (high/medium risk hunks) and boilerplate (formatting/imports/locks).
4. Flagged sections render inline with diff hunks using the same parsing as `ReviewDiffView`.
5. Boilerplate sections render collapsed with a summary line and expand toggle.
6. A pill toggle in the header switches between "Briefing" and "Raw diff" views.

## Component structure

```
ReviewModeContent
  ├── ReviewModeHeader (with pill toggle: Briefing | Raw diff)
  ├── ReviewModeBody
  │   ├── ReviewQueueStrip
  │   └── review-mode-main-area
  │       ├── ReviewBriefingView (default)
  │       │   ├── BriefingSummary (narrative + totals)
  │       │   ├── BriefingFlaggedSection
  │       │   │   ├── BriefingFlaggedFile (per file with risk chip)
  │       │   │   │   ├── file header (path, +N/-N, risk badge)
  │       │   │   │   └── inline hunks (DiffLine[] shared with ReviewDiffView)
  │       │   │   └── ...
  │       │   ├── BriefingBoilerplateSection (collapsed)
  │       │   │   ├── collapse header ("+240/-30 formatting & imports - expand")
  │       │   │   └── expanded file list (DiffFileEntry items)
  │       │   └── ...
  │       └── ReviewDiffView (fallback, shown when "Raw diff" selected)
```

## View toggle state

The toggle state (briefing vs raw diff) is local component state inside `ReviewModeContent`. Default is "briefing".

## Flagged hunks rendering

Flagged hunks reuse the `DiffLine` type and `DiffLineRow` component from `ReviewDiffView` for visual consistency. Each flagged file shows:
- A header row with file path, `+N/-N` stats, and risk level chip
- Inline diff lines for all hunks in that file (using `parseDiffLines`)

## Boilerplate rendering

Boilerplate sections show a single summary line:
- `+N/-N <label> - expand` where label is "formatting & imports" or "lock files" etc.
- Clicking expands to show individual file entries
- Each file entry shows path and `+N/-N` stats (no inline diff)

## Color scheme

- Flagged section headers: risk-level chip (same as queue strip)
- Flagged hunks: same coloring as diff viewer (green add, red remove)
- Boilerplate headers: muted, `var(--text-muted)` text
- Boilerplate expanded: `var(--bg-hover)` background
- Summary: `var(--text-secondary)` with accent highlight for counts
