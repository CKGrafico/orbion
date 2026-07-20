# gh-154: Agent briefing first; raw diff as the fallback

## Summary

Replace the raw diff view as the default in PR review mode with an agent briefing view. The briefing shows what changed, why, and where the risk is, with flagged hunks shown inline and boilerplate changes collapsed into a one-line summary like "+240/-30 formatting & imports - expand". A single action switches to the full raw diff. The briefing derives only from actual diff content.

## Motivation

The current review mode (gh-153) opens directly to the raw diff viewer. The issue asks for the agent's briefing as the default view, surfacing the most important information first (flagged hunks, risk areas) while collapsing noise (formatting, imports, lock files). The raw diff remains one click away for deep inspection.

## Design

### New infra action: `get-pr-briefing`

A new `InfraAction` value `"get-pr-briefing"` that takes `GetPrBriefingParams { repo: string; number: number }` and returns `GetPrBriefingResult`. The main process handler calls `gh pr diff` internally (reusing existing diff-fetch logic), then runs a local heuristic analysis to produce a structured briefing. No LLM is involved; the briefing is derived purely from diff content using pattern matching, risk heuristics, and line classification.

### New types in `shared/ipc.ts`

- `GetPrBriefingParams { repo: string; number: number }` - params for the briefing request.
- `BriefingFileGroup { label: string; additions: number; deletions: number; files: DiffFileEntry[] }` - a collapsible group of boilerplate files (formatting, imports, lock files).
- `BriefingSection { kind: "flagged" | "boilerplate"; title: string; files: DiffFileEntry[]; group?: BriefingFileGroup }` - a section in the briefing: flagged (high/medium risk hunks shown inline) or boilerplate (collapsed summary).
- `GetPrBriefingResult { sections: BriefingSection[]; summary: string; totalFlagged: number; totalBoilerplate: number }` - the full briefing.

### Briefing view component: `ReviewBriefingView`

A new component that replaces `ReviewDiffView` as the default main content in the review overlay:

1. **Briefing summary** - Top area with the agent's narrative ("3 files touch auth logic; +240/-30 formatting changes collapsed").
2. **Flagged sections** - File groups with risk flags shown inline. Each flagged file shows its diff hunks (additions/removals) with hunk headers.
3. **Boilerplate sections** - Collapsed by default, shown as a single line like "+240/-30 formatting & imports - expand". Clicking expands to show the files.
4. **Toggle to raw diff** - A single button/action switches the main area to the raw `ReviewDiffView`.
5. **Raw diff as fallback** - The `ReviewDiffView` remains available; a toggle in the header switches between briefing and raw diff views.

### Review mode header toggle

Add a segmented pill switcher in the review mode header's right area with two options: "Briefing" (default) and "Raw diff" (fallback). This uses the existing segmented pill switcher component pattern.

### Diff content classification (main process)

The main process `handleGetPrBriefing` handler classifies diff content into:

- **Flagged**: Files matching high-risk or medium-risk patterns (auth, credentials, config, security files) from the existing `diff-analyzer.ts` patterns.
- **Boilerplate**: Files matching formatting-only patterns (whitespace-only changes, import reordering, lock files, generated files, trailing commas).

Classification heuristics:
- A file is "formatting-only" if all additions are whitespace changes (indent, trailing comma, blank lines) with no semantic code changes.
- A file is "import-only" if all additions/removals are import/export statements.
- Lock files, `.lock` extensions, and generated file patterns are always boilerplate.
- Files matching `HIGH_RISK_PATTERNS` or `MEDIUM_RISK_PATTERNS` are always flagged.

### i18n

New keys under `reviewMode.briefing.*` for:
- Briefing tab label ("Briefing")
- Raw diff tab label ("Raw diff")
- Flagged section header ("Flagged changes")
- Boilerplate section header ("Formatting & imports")
- Expand boilerplate ("expand")
- Collapse boilerplate ("collapse")
- No flagged changes message ("No flagged changes in this PR")
- Summary templates

### Mock counterpart

`MockInfraService` returns a realistic briefing structure derived from the existing mock diff (which already includes auth, config, API route, binary, and formatting files).

### Styling

Follows existing theme. Briefing sections use the card/panel visual language. Flagged hunks use the same add/remove coloring as the diff viewer. Boilerplate sections are muted/collapsed with a subtle "expand" affordance. The toggle pill uses the existing segmented switcher component.

## Tasks

1. Add `get-pr-briefing` IPC types to `shared/ipc.ts`
2. Add briefing classification logic to `src/main/diff-analyzer.ts`
3. Implement main-process `handleGetPrBriefing` handler
4. Add `parseBriefingSections` renderer-side utility
5. Create `ReviewBriefingView` component
6. Add review mode tab toggle (Briefing / Raw diff) in header
7. Wire `ReviewBriefingView` as default in `ReviewModeOverlay`
8. Add i18n keys for briefing view strings
9. Add CSS for briefing view in `theme.css`
10. Add mock handler for `get-pr-briefing`
11. Verify `pnpm typecheck` passes

## Out of scope

- LLM-generated narrative (the briefing uses heuristic analysis only)
- Approve / request-changes as chat-style verbs (separate issue)
- Cross-PR conflict / duplicate detection (separate issue)
