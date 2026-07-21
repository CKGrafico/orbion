## MODIFIED Requirements

### Requirement: detectPlatform returns both platform and remotes

The `detectPlatform()` function SHALL return a `PlatformDetection` struct containing both the classified `platform` and the parsed `remotes` array from a single `git remote -v` execution.

#### Scenario: Successful detection returns both fields
- **WHEN** `detectPlatform(directory)` is called and `git remote -v` succeeds
- **THEN** the function SHALL return `{ platform: <PlatformType>, remotes: <string[]> }` where `platform` is the classification of the remotes and `remotes` is the deduplicated URL list

#### Scenario: Git failure returns consistent fallback
- **WHEN** `detectPlatform(directory)` is called and `git remote -v` fails (error, timeout, no git)
- **THEN** the function SHALL return `{ platform: "unknown", remotes: [] }`
