## ADDED Requirements

### Requirement: No NPM_PACKAGES entry uses version "latest"
The `NPM_PACKAGES` constant in `verified-install.ts` SHALL NOT contain any entry where `version` is the string `"latest"`. Every entry MUST use a pinned version string (e.g., `"2.2.2"`, `"0.0.0"`).

#### Scenario: Unpinned entry detected at runtime
- **WHEN** the `verified-install.ts` module is loaded
- **THEN** a validation function SHALL throw an `Error` if any entry in `NPM_PACKAGES` has `version: "latest"`

#### Scenario: All entries are pinned
- **WHEN** every entry in `NPM_PACKAGES` has a pinned version string
- **THEN** the module loads without error

### Requirement: Unit test guards against version "latest" regression
A unit test SHALL exist that imports `NPM_PACKAGES` and asserts that no entry has `version: "latest"`.

#### Scenario: CI prevents unpinned versions from merging
- **WHEN** a developer adds or modifies an entry in `NPM_PACKAGES` with `version: "latest"`
- **THEN** the unit test fails, blocking the change

### Requirement: Previously unpinned entries use pinned versions
The entries `openCode`, `jira`, and `gitlab` in `NPM_PACKAGES` MUST use specific pinned version strings instead of `"latest"`.

#### Scenario: opencode uses a pinned version
- **WHEN** `NPM_PACKAGES.openCode.version` is read
- **THEN** it SHALL be a pinned version string, not `"latest"`

#### Scenario: jira uses a pinned version
- **WHEN** `NPM_PACKAGES.jira.version` is read
- **THEN** it SHALL be a pinned version string, not `"latest"`

#### Scenario: gitlab uses a pinned version
- **WHEN** `NPM_PACKAGES.gitlab.version` is read
- **THEN** it SHALL be a pinned version string, not `"latest"`
