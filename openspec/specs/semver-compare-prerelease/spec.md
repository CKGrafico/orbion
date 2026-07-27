# semver-compare-prerelease Specification

## Purpose
TBD - created by archiving change compare-semver-prerelease-nan. Update Purpose after archive.
## Requirements
### Requirement: Strips pre-release suffix before parsing
`compareSemver` SHALL strip pre-release identifiers (everything from the first `-` onward) and build metadata (everything from the first `+` onward) before splitting on `.` and parsing numeric segments.

#### Scenario: Pre-release version compared to release version
- **WHEN** `compareSemver("2.0.0", "2.0.0-beta.1")` is called
- **THEN** the result SHALL be `0` (equal, because `2.0.0-beta.1` is stripped to `2.0.0`)

#### Scenario: Pre-release version below floor
- **WHEN** `compareSemver("2.0.0-beta.1", "3.0.0")` is called
- **THEN** the result SHALL be negative (pre-release is below `3.0.0` floor)

#### Scenario: Build metadata stripped
- **WHEN** `compareSemver("2.0.0+build.123", "2.0.0")` is called
- **THEN** the result SHALL be `0`

### Requirement: Handles NaN segments gracefully
If after stripping pre-release/build metadata a segment still parses as `NaN`, `compareSemver` SHALL treat that segment as `0` rather than propagating `NaN`.

#### Scenario: Non-numeric segment in version string
- **WHEN** `compareSemver("2.x.0", "2.0.0")` is called
- **THEN** the result SHALL be `0` (`x` treated as `0`)

### Requirement: Preserves existing behavior for plain semver
All existing behavior for plain semver strings SHALL be preserved — no regression.

#### Scenario: v-prefixed version
- **WHEN** `compareSemver("v2.0.0", "2.0.0")` is called
- **THEN** the result SHALL be `0`

#### Scenario: Short version strings
- **WHEN** `compareSemver("2.0", "2.0.0")` is called
- **THEN** the result SHALL be `0`

#### Scenario: Unequal versions
- **WHEN** `compareSemver("1.9.0", "2.0.0")` is called
- **THEN** the result SHALL be negative

#### Scenario: Equal versions
- **WHEN** `compareSemver("2.0.0", "2.0.0")` is called
- **THEN** the result SHALL be `0`

