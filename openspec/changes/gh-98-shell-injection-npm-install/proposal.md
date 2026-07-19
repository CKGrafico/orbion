## Why

The `pinnedNpmInstall()` function in `verified-install.ts` interpolates `pkg` and `version` from `NPM_PACKAGES` directly into a shell string (`npm install -g ${pkg}@${version}`) with zero validation for shell-injection characters. This string is embedded into remote SSH scripts executed on target VMs. A compromised or typoed `version` value (e.g., `0.0.0'; rm -rf /; echo '`) would allow arbitrary remote command execution. The existing `validateNpmPackages()` guard only rejects the literal string `"latest"` — it does not defend against shell metacharacters.

Related secondary issues: `ssh-probe.ts` line 123 interpolates `t.id` and `t.binary` unquoted into `check_tool` calls; `ssh-launch.ts` interpolates `${binary}` unquoted into apt/brew/snap command templates.

## What Changes

- Add a `validateNpmIdentifier()` function that ensures `pkg` and `version` contain only characters safe for npm package names and semver strings (no shell metacharacters like `;`, `'`, `"`, `$`, `` ` ``, `|`, `&`, `>`, `<`, `(`, `)`, `{`, `}`).
- Call `validateNpmIdentifier()` from `pinnedNpmInstall()` before returning the command string — fail fast if validation fails.
- Strengthen `validateNpmPackages()` to also invoke `validateNpmIdentifier()` on every entry at module-load time.
- Quote `${binary}` in all `ssh-launch.ts` install-block templates where it is interpolated into shell commands.
- Quote `$1` in the `check_tool()` shell function in `ssh-probe.ts` (already quoted via `"\$1"` in the template, but the interpolation of `t.id` and `t.binary` in the call lines must also be safe — validate them at the TypeScript level).

## Capabilities

### New Capabilities
- `shell-safe-npm-install`: Validates that npm package name and version strings contain only safe characters before they are interpolated into shell commands, preventing remote command injection via SSH.

### Modified Capabilities
- `pinned-npm-guard`: Extends the existing guard to also reject entries with shell-unsafe characters (currently only rejects `"latest"`).

## Impact

- **Core files**: `src/main/verified-install.ts` (primary), `src/main/ssh-launch.ts` (binary quoting), `src/main/ssh-probe.ts` (check_tool quoting)
- **No API changes**: All changes are internal to the main process; no IPC contract changes.
- **No breaking changes**: Existing valid `NPM_PACKAGES` entries all pass the new validation.
- **Tests**: Unit tests for `validateNpmIdentifier()` and enhanced `validateNpmPackages()`.
