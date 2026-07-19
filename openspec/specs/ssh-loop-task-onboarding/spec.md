# SSH loop-task onboarding

## Requirements

### Requirement: Probe loop-task after SSH validation
For SSH-reach onboarding, Orbion SHALL detect the presence of the `loop-task` command and the state of the loop-task daemon after SSH authentication succeeds.

When the wizard is launched with pre-filled values from an imported bootstrap seed, the wizard SHALL skip the reach-method and target-selection steps and proceed directly to probing.

#### Scenario: Fresh machine has no loop-task command
- **WHEN** SSH authentication succeeds and `command -v loop-task` fails
- **THEN** the probe reports loop-task as missing
- **AND** the wizard offers installation before saving the environment

#### Scenario: loop-task is already available
- **WHEN** SSH authentication succeeds and the loop-task command or daemon is available
- **THEN** the wizard does not offer an unnecessary reinstall
- **AND** it starts or reuses the daemon as needed

#### Scenario: Wizard launched from bootstrap seed skips to probing
- **WHEN** the wizard is launched with pre-filled reach method and target from an imported seed
- **THEN** the wizard skips the "pick-reach-method" and "pick-target" steps
- **AND** proceeds directly to the probing step with the seed's values

### Requirement: Enforce the supported Node version
Orbion SHALL require Node.js 20 or newer before installing loop-task on an SSH-reach machine.

#### Scenario: Node is older than version 20
- **WHEN** the SSH probe finds Node.js below version 20
- **THEN** the wizard offers the existing Node upgrade path
- **AND** loop-task installation does not start until a reprobe confirms a supported version

### Requirement: Install and start loop-task with one action
When loop-task is missing on an SSH-reach machine, Orbion SHALL offer one primary action that installs the pinned `loop-task` npm package globally and starts its daemon on loopback.

#### Scenario: User accepts installation
- **WHEN** the user selects the install-and-start action
- **THEN** Orbion runs the existing verified global npm install over SSH
- **AND** starts the daemon bound to `127.0.0.1`
- **AND** continues onboarding only after startup succeeds

#### Scenario: User cancels installation
- **WHEN** the user cancels instead of installing
- **THEN** Orbion stops onboarding
- **AND** does not save an environment

### Requirement: Expose actionable failure output
Orbion SHALL display the actual remote output from a failed loop-task install or daemon start and keep retry and cancel actions available.

#### Scenario: npm install or daemon startup fails
- **WHEN** the remote install or bounded startup readiness check exits unsuccessfully
- **THEN** the wizard displays captured stdout, stderr, or relevant remote logs
- **AND** the user can retry the SSH onboarding flow or cancel it

### Requirement: Keep local onboarding user-managed
Orbion SHALL NOT offer loop-task installation for local/direct instances.

#### Scenario: User selects local reach
- **WHEN** the direct loop-task API URL validates successfully
- **THEN** Orbion saves the local environment without invoking SSH probe or install commands
