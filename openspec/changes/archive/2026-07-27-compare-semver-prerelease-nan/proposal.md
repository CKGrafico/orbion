## Why

`compareSemver` in `src/shared/utils.ts` splits version strings on `.` and maps each segment to `Number`. Pre-release tags like `-beta.1` produce `NaN` segments, causing the function to return `NaN`. All downstream `< 0` checks silently evaluate to `false`, disabling version floor warnings for pre-release builds of Node.js or OpenCode. A user on `20.1.0-beta.1` will never see the "version too old" warning even if the version is below the floor.

## What Changes

- Fix `compareSemver` to strip pre-release (`-beta.1`) and build metadata (`+build.123`) suffixes before parsing numeric segments.
- Add a `NaN` safety guard: if any parsed segment is `NaN`, treat it as `0` rather than propagating `NaN`.
- Add unit tests for `compareSemver` covering pre-release, build metadata, `v` prefix, short versions, and `NaN` edge cases.

## Capabilities

### New Capabilities
- `semver-compare-prerelease`: robust semver comparison handling pre-release and build metadata suffixes

### Modified Capabilities

_(none — no existing spec governs `compareSemver`)_

## Impact

- `src/shared/utils.ts`: `compareSemver` function rewritten
- `tests/compare-semver.test.ts`: new test file
- `src/main/ssh-probe.ts`: no direct change (consumer, behavior improves automatically)
- `src/main/opencode-client.ts`: no direct change (consumer, behavior improves automatically)
