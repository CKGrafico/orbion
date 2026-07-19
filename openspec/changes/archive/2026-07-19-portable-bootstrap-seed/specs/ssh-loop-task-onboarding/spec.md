## MODIFIED Requirements

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
