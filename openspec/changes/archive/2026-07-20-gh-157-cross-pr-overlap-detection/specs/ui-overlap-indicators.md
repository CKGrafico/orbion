# Spec: UI Changes for Overlap Indicators

## Queue Strip Row Enhancement

Each row in `ReviewQueueStrip` gains an optional overlap indicator rendered below the verdict line:

```
┌──────────────────────────────────┐
│ ⎇  #42  Fix auth middleware      │
│    ● HIGH  Touches auth files    │
│    ⚠ overlaps #58 — review together │
└──────────────────────────────────┘
```

- The overlap chip uses `--warning` (`#ffcc5c`) color, matching existing warning semantics.
- Multiple overlaps are shown as a single line: "overlaps #42, #58 — review together".
- When no overlaps exist for a PR, nothing extra is rendered.

## Review Order Banner

When overlaps are detected, a compact banner appears at the top of the review main area (above the briefing/diff content):

```
⚠ 2 overlapping PRs detected — suggested order: #42 → #58 → #15 → #67
```

- The banner is dismissible (click X to hide, stays hidden for the session).
- PR numbers are clickable (navigate to that PR in the queue).
- Uses `--warning` background tint and `--warning` text color.

## Briefing View File-Level Overlap Note

In `ReviewBriefingView`, each flagged file row can show an additional note if that file is also changed by another PR in the batch:

```
▼ src/auth/middleware.ts  HIGH  +12/-3
  ⚠ also changed by #58
```

- The note is a subtle text line below the file path, using `--text-muted` + `--warning` accent on the PR number.
- Only shown when the file appears in another PR's file list.
