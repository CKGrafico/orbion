## Context

`compareSemver` in `src/shared/utils.ts` is a simple numeric version comparator used by `ssh-probe.ts` and `opencode-client.ts` for version floor checks. It splits on `.` and maps to `Number`, which yields `NaN` for pre-release segments (`2.0.0-beta.1`). `NaN` propagation renders all downstream comparisons silently false.

## Goals / Non-Goals

**Goals:**
- Make `compareSemver` return a valid number for any semver-compatible version string including pre-release and build metadata
- Preserve existing behavior for plain semver strings (no regression)
- Add test coverage

**Non-Goals:**
- Full semver specification compliance (pre-release ordering per semver spec is out of scope — pre-release versions compare as equal to their release counterpart)
- Replacing with a third-party semver library

## Decisions

1. **Strip pre-release and build metadata before parsing.** Split on `-` first (pre-release), then `+` (build metadata), then take the prefix before either. This matches the issue's suggested fix and keeps the function zero-dependency.
2. **Treat `NaN` as `0` rather than returning `0` or throwing.** If after stripping a segment is still non-numeric (e.g. `2.x.0`), using `0` is the safest default that won't silently skip the check. The comparison still runs and the closest-correct result is returned.
3. **No new dependency.** Adding `semver` npm package would work but this is a focused 3-line fix in an existing shared utility — a new dependency is disproportionate.

## Risks / Trade-offs

- **Pre-release versions compare as equal to release.** `2.0.0-beta.1` compares equal to `2.0.0` because the pre-release tag is stripped. This is acceptable: the goal is to prevent silent pass-through, not to implement full semver ordering. Pre-release is always >= floor when major.minor.patch matches.
- **Non-numeric segments become 0.** A malformed version like `2.x.0` would treat `x` as `0`, comparing as `2.0.0`. This is better than `NaN` propagation and is unlikely in practice (Node and OpenCode versions are well-formed).
