## ADDED Requirements

### Requirement: npm package names are validated against a safe-character allowlist
The `validateNpmIdentifier()` function SHALL validate that a `pkg` string contains only characters permitted in npm package names: scoped packages matching `^@[a-z0-9][-a-z0-9/]*@?[a-z0-9][-a-z0-9]*$` and unscoped packages matching `^[a-z0-9][-a-z0-9]*$`. Any string not matching the allowlist SHALL cause a thrown `Error`.

#### Scenario: Valid scoped package name passes validation
- **WHEN** `validateNpmIdentifier()` is called with `pkg: "@anthropic-ai/claude-code"`
- **THEN** it SHALL return without error

#### Scenario: Valid unscoped package name passes validation
- **WHEN** `validateNpmIdentifier()` is called with `pkg: "loop-task"`
- **THEN** it SHALL return without error

#### Scenario: Package name with shell metacharacter is rejected
- **WHEN** `validateNpmIdentifier()` is called with `pkg: "foo;rm -rf /"`
- **THEN** it SHALL throw an `Error`

#### Scenario: Package name with single quote is rejected
- **WHEN** `validateNpmIdentifier()` is called with `pkg: "foo'bar"`
- **THEN** it SHALL throw an `Error`

### Requirement: npm version strings are validated against a safe-character allowlist
The `validateNpmIdentifier()` function SHALL validate that a `version` string matches the semver pattern `^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$`. Any string not matching the allowlist SHALL cause a thrown `Error`.

#### Scenario: Valid semver version passes validation
- **WHEN** `validateNpmIdentifier()` is called with `version: "2.2.2"`
- **THEN** it SHALL return without error

#### Scenario: Valid semver with prerelease tag passes validation
- **WHEN** `validateNpmIdentifier()` is called with `version: "1.0.0-beta.1"`
- **THEN** it SHALL return without error

#### Scenario: Version with shell injection is rejected
- **WHEN** `validateNpmIdentifier()` is called with `version: "0.0.0'\''; rm -rf /; echo ts"`
- **THEN** it SHALL throw an `Error`

#### Scenario: Version "latest" is rejected
- **WHEN** `validateNpmIdentifier()` is called with `version: "latest"`
- **THEN** it SHALL throw an `Error`

### Requirement: pinnedNpmInstall validates before returning a command string
The `pinnedNpmInstall()` function SHALL call `validateNpmIdentifier()` on the `pkg` and `version` from the requested `NPM_PACKAGES` entry before building and returning the `npm install` command string.

#### Scenario: PinnedNpmInstall with valid entry succeeds
- **WHEN** `pinnedNpmInstall("loopTask")` is called
- **THEN** it SHALL return `npm install -g loop-task@2.2.2`

#### Scenario: PinnedNpmInstall with invalid entry throws
- **WHEN** a `NPM_PACKAGES` entry contains a `version` with shell metacharacters AND `pinnedNpmInstall()` is called with that key
- **THEN** it SHALL throw an `Error` before constructing the command string

### Requirement: Shell binary names are quoted in install command templates
In `ssh-launch.ts`, all `${binary}` interpolations in shell command templates (`apt-get`, `brew`, `snap`, `pip3`) SHALL be double-quoted as `"${binary}"` to prevent word-splitting or injection.

#### Scenario: apt-get install uses quoted binary
- **WHEN** an `apt-brew` tool install block is generated
- **THEN** the apt-get command SHALL contain `apt-get install -y -qq "${binary}"` (quoted)

#### Scenario: brew install uses quoted binary
- **WHEN** an `apt-brew` tool install block is generated and brew is used
- **THEN** the brew command SHALL contain `brew install "${binary}"` (quoted)

### Requirement: check_tool arguments are quoted in SSH probe
In `ssh-probe.ts`, the `check_tool` function call lines generated from `TOOL_DEFINITIONS` SHALL quote both the `id` and `binary` arguments.

#### Scenario: check_tool call uses quoted arguments
- **WHEN** the `TOOLS_PROBE_SCRIPT` is generated
- **THEN** each call line SHALL be in the form `check_tool "${id}" "${binary}"`
