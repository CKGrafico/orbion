## Why

The project guardrails require all `src/**/*.ts` and `src/**/*.tsx` files to stay at or below 10% comment ratio, yet an audit reveals ~65 files (30% of the codebase) exceed this limit, with an overall ratio of ~11%. Over-commented code obscures the intent that should be conveyed by names, structure, and types. This change enforces the existing rule by cleaning every offending file and adding an automated hard gate.

## What Changes

- **Comment cleanup across ~65 files** in `src/main/`, `src/renderer/src/`, `src/shared/`, and `src/visual-evidence/`. Remove JSDoc/TSDoc that restates type information, inline `//` comments that restate what the code does, and block comments that duplicate information already conveyed by names or signatures. Preserve only genuine "why" comments (workarounds, platform quirks, non-obvious edge cases, references to issues or specs).
- **No behavioral change.** Only comment removal and minor renaming for clarity where removing comments reveals unclear code.
- **New `pnpm check:comments` command** (`scripts/comment-ratio.ts`) that measures comment ratio per file and fails the build when any source file exceeds 10%.
- **Guardrail updates** in `.agents/skills/ob-guardrails-project/SKILL.md` and `.agents/skills/ob-guardrails-generic/SKILL.md` to make the rule actionable with the new check command.

## Capabilities

### New Capabilities
- `comment-ratio-enforcement`: Automated comment ratio checking and enforcement across all source files.

### Modified Capabilities

(No existing spec-level capability is modified — this is a code hygiene change.)

## Impact

- **Files affected:** ~65 source files across `src/` (comment removal only, no logic changes).
- **Build:** New `scripts/comment-ratio.ts` script; `pnpm check:comments` added to `package.json`.
- **Guardrails:** `.agents/skills/ob-guardrails-project/SKILL.md` and `.agents/skills/ob-guardrails-generic/SKILL.md` updated with explicit comment ratio definition and enforcement command.
- **No API, runtime, or dependency changes.** Purely a comment cleanup and tooling addition.
