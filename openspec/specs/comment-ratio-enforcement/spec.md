# comment-ratio-enforcement Specification

## Purpose
TBD - created by archiving change enforce-comment-ratio. Update Purpose after archive.
## Requirements
### Requirement: Comment ratio shall not exceed 10% in any source file
Every `src/**/*.ts` and `src/**/*.tsx` file SHALL have a comment ratio at or below 10%, measured as (comment lines / non-blank lines) per file. All comment types count: inline `//`, block `/* */`, JSDoc/TSDoc `/** */`, and trailing comments. There are no exemptions for JSDoc or TSDoc.

#### Scenario: File at exactly 10% comment ratio
- **WHEN** a source file has 10 non-blank lines and exactly 1 comment line
- **THEN** the file passes the comment ratio check

#### Scenario: File exceeding 10% comment ratio
- **WHEN** a source file has 10 non-blank lines and 2 comment lines (20% ratio)
- **THEN** the file fails the comment ratio check

#### Scenario: Test files are exempt
- **WHEN** a file matches `tests/**/*.test.ts`
- **THEN** the file is excluded from the comment ratio check

### Requirement: Only "why" comments shall remain
Comments that restate what the code does (the "what") SHALL be removed. Comments explaining non-obvious reasons, constraints, or gotchas SHALL be preserved. Even architectural or contract-describing comments SHALL be removed if they restate what the code does.

#### Scenario: Removing a "what" comment
- **WHEN** a file contains `// increment counter` above `counter++`
- **THEN** the comment is removed because the code is self-explanatory

#### Scenario: Preserving a "why" comment
- **WHEN** a file contains `// Workaround for Electron issue #1234` above a platform-specific check
- **THEN** the comment is preserved because it explains non-obvious reasoning

### Requirement: Automated enforcement via check:comments script
A `pnpm check:comments` command SHALL be added that measures comment ratio per source file and exits with code 1 when any file exceeds 10%. This SHALL be a hard gate, not a warning.

#### Scenario: All files within limit
- **WHEN** `pnpm check:comments` is run and no file exceeds 10% comment ratio
- **THEN** the command exits with code 0

#### Scenario: Any file exceeds limit
- **WHEN** `pnpm check:comments` is run and at least one file exceeds 10% comment ratio
- **THEN** the command exits with code 1 and prints the offending file(s) with their ratios

### Requirement: No behavioral changes from comment cleanup
The comment cleanup SHALL NOT alter any logic, types, or runtime behavior. Only comment lines and occasional variable/function renaming for clarity are permitted.

#### Scenario: Typecheck passes after cleanup
- **WHEN** `pnpm typecheck` is run after the comment cleanup
- **THEN** the command exits with code 0

#### Scenario: No runtime behavior changes
- **WHEN** the comment cleanup is applied
- **THEN** no function signatures, control flow, or exported types are modified

