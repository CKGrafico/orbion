## Context

The `pinnedNpmInstall()` function in `src/main/verified-install.ts` builds `npm install -g ${pkg}@${version}` strings by directly interpolating `pkg` and `version` from `NPM_PACKAGES`. These strings flow into remote SSH shell scripts in `ssh-launch.ts` (lines 80, 265, 500–508) and are executed on target VMs. The only existing guard (`validateNpmPackages()`) rejects the literal string `"latest"` but does not check for shell metacharacters. A version like `2.2.2'; rm -rf /; echo '` would execute arbitrary commands on the remote machine.

Additionally, `ssh-launch.ts` interpolates `${binary}` from `TOOL_DEFINITIONS` unquoted into apt/brew/snap/pip commands, and `ssh-probe.ts` line 123 calls `check_tool ${t.id} ${t.binary}` without quoting.

The codebase already has a pattern for shell-safety validation: `validateHash()` in `ssh-launch.ts` enforces a hex-only pattern on hash values before they are interpolated into shell templates.

## Goals / Non-Goals

**Goals:**
- Prevent shell injection through `pkg` and `version` values in `pinnedNpmInstall()` by validating they contain only safe characters
- Fail fast at module-load time if any `NPM_PACKAGES` entry contains shell-unsafe characters
- Quote `${binary}` in all shell command templates in `ssh-launch.ts`
- Ensure `check_tool` calls in `ssh-probe.ts` use quoted variables
- Add unit tests proving injection vectors are blocked

**Non-Goals:**
- Changing the npm install mechanism (e.g., switching from `execSync` to `execFile` — that would be a larger refactor for a separate change)
- Validating `TOOL_DEFINITIONS.binary` or `.id` at the TypeScript level (they come from hardcoded data, not user input; the shell quoting fix is sufficient defense-in-depth)
- Rewriting the remote script to use arrays instead of string interpolation (out of scope)

## Decisions

### Decision 1: Character-class allowlist for `pkg` and `version`

**Choice**: Validate with allowlist regex: `pkg` matches `^@[a-z0-9][-a-z0-9/]*@?[a-z0-9][-a-z0-9]*$` (scoped packages like `@anthropic-ai/claude-code`) and `version` matches `^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$` (semver with optional prerelease tag).

**Rationale**: An allowlist is strictly more secure than a denylist approach. The npm package name spec allows a limited character set; semver is even more restricted. By only allowing characters that are valid in these contexts, we eliminate the entire class of shell-injection attacks rather than playing whack-a-mole with dangerous characters.

**Alternative considered**: Denylist of shell metacharacters (`;`, `'`, `"`, `$`, `` ` ``, `|`, `&`, `>`, `<`, `(`, `)`, `{`, `}`) — rejected because it's fragile and easy to miss edge cases.

### Decision 2: Validation at two levels — module-load AND function-call

**Choice**: Strengthen `validateNpmPackages()` (runs at import time) to also check `pkg` and `version` against the allowlist regexes. Additionally, call a `validateNpmIdentifier()` guard inside `pinnedNpmInstall()` for defense in depth.

**Rationale**: Module-load time catches typos in the static `NPM_PACKAGES` constant early. But the function-level check protects against future callers who might pass dynamic input to `pinnedNpmInstall()`.

### Decision 3: Quote `${binary}` in shell templates rather than validate it

**Choice**: In `ssh-launch.ts`, wrap `${binary}` in double quotes (`"${binary}"`) in apt/brew/snap/pip command templates. In `ssh-probe.ts`, quote the arguments to `check_tool` calls.

**Rationale**: The `binary` values come from hardcoded `TOOL_DEFINITIONS`, so the risk is theoretical. Adding quoting is a cheap defense-in-depth that requires no TypeScript-level validation — if a binary name ever contained a space or special character, quoting would handle it correctly.

## Risks / Trade-offs

- **Risk**: Overly strict regex could reject valid npm package names (e.g., unicode names, unusual scoped packages) → **Mitigation**: The regex is aligned with npm's actual package name rules. All 5 current entries already pass. If a future package needs a different pattern, the regex can be updated.
- **Risk**: Quoting `${binary}` could change behavior if existing scripts relied on word-splitting → **Mitigation**: All current `binary` values are single tokens (`gh`, `az`, `docker`, etc.) — quoting has zero effect on them.
