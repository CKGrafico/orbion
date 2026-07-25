## Context

An audit of 222 `src/**/*.ts` and `src/**/*.tsx` files shows ~65 files exceeding the 10% comment ratio limit defined in the project guardrails. The codebase has accumulated explanatory comments that restate what code does rather than why it does it. The guardrails already state the rule but lack an automated enforcement mechanism.

## Goals / Non-Goals

**Goals:**
- Remove all comments that merely restate what the code does (the "what") from every offending file.
- Preserve only comments that explain non-obvious reasoning ("why") — workarounds, platform quirks, references to external specs or issues.
- Add a `pnpm check:comments` hard-gate script that fails the build when any source file exceeds 10% comment ratio.
- Update guardrails documentation to make the rule explicit and actionable.

**Non-Goals:**
- Logic refactoring, type changes, or architectural changes.
- Cleaning test files (`tests/**/*.test.ts`).
- Changes to markdown, config files, or non-source assets.

## Decisions

### D1: Comment ratio formula
**Decision:** Comment ratio = comment lines / non-blank lines, measured per file.

**Rationale:** Using non-blank lines (not total lines) avoids inflating the denominator with blank lines, which don't contribute to readability. This matches the issue's acceptance criteria. Comment lines are any line containing `//`, `/*`, `*/`, or JSDoc `* ` markers (at line start after optional whitespace).

**Alternative considered:** Total lines including blanks. Rejected because blank-line padding would artificially lower ratios, hiding over-commented small files.

### D2: Script implementation — TypeScript with simple regex
**Decision:** `scripts/comment-ratio.ts` using `fs.readFileSync` + regex line-by-line counting. No external dependencies.

**Rationale:** The check is a single-pass line scan. No parser needed since we count line-level markers, not semantic AST. Keeping it dependency-free avoids build complexity.

**Alternative considered:** Using `ts-morph` or a full TS parser. Rejected — overkill for line counting and adds a dependency.

### D3: Enforcement approach — hard fail, not warning
**Decision:** The script exits with code 1 when any file exceeds 10%. No exemptions.

**Rationale:** Warnings are ignored in practice. A hard gate ensures the ratio stays enforced. The guardrails already define this as a hard rule.

### D4: Batch processing order
**Decision:** Process files from highest ratio to lowest, grouped by directory. Process `src/main/`, `src/shared/`, `src/renderer/src/`, and `src/visual-evidence/` as separate waves.

**Rationale:** Highest-ratio files benefit most from cleanup and provide the largest per-file impact. Grouping by directory enables parallel processing and reduces context-switching.

### D5: JSDoc/TSDoc treatment
**Decision:** Remove JSDoc/TSDoc that restates type information already conveyed by the signature. Only "why" JSDoc survives.

**Rationale:** The issue explicitly states no exemptions for JSDoc. Code and type signatures must be self-explanatory.

## Risks / Trade-offs

- **[Risk] Removing a "why" comment that looks like a "what" comment.** → Mitigation: Each file reviewed carefully; when in doubt, preserve the comment.
- **[Risk] Breaking type inference after removing block comments that served as implicit documentation.** → Mitigation: Run `pnpm typecheck` after each batch.
- **[Risk] Losing IDE hover documentation from removed JSDoc.** → Mitigation: Code and type signatures must become self-explanatory; genuinely needed info goes into naming.
- **[Trade-off] Large diff makes code review harder.** → Mitigation: Batch by directory; each batch is one commit.
