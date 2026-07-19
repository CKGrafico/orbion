## MODIFIED Requirements

### Requirement: No NPM_PACKAGES entry uses version "latest"
The `NPM_PACKAGES` constant in `verified-install.ts` SHALL NOT contain any entry where `version` is the string `"latest"` or where `pkg` or `version` contain characters outside their respective safe allowlists (as defined in the `shell-safe-npm-install` spec). Every entry MUST use a pinned version string (e.g., `"2.2.2"`, `"0.0.0"`) and a package name that matches the npm package name allowlist.

#### Scenario: Unpinned entry detected at runtime
- **WHEN** the `verified-install.ts` module is loaded
- **THEN** a validation function SHALL throw an `Error` if any entry in `NPM_PACKAGES` has `version: "latest"` or if `pkg`/`version` contain disallowed characters

#### Scenario: All entries are valid
- **WHEN** every entry in `NPM_PACKAGES` has a pinned version string and safe package name
- **THEN** the module loads without error

### Requirement: Unit test guards against version "latest" regression
A unit test SHALL exist that imports `NPM_PACKAGES` and asserts that no entry has `version: "latest"` and that all `pkg` and `version` values pass the safe-character allowlist validation.

#### Scenario: CI prevents unpinned versions from merging
- **WHEN** a developer adds or modifies an entry in `NPM_PACKAGES` with `version: "latest"`
- **THEN** the unit test fails, blocking the change

#### Scenario: CI prevents shell-unsafe characters from merging
- **WHEN** a developer adds or modifies an entry in `NPM_PACKAGES` with shell-unsafe characters in `pkg` or `version`
- **THEN** the unit test fails, blocking the change
