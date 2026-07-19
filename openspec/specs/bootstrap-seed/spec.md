## ADDED Requirements

### Requirement: Export bootstrap seed
The system SHALL allow the user to export a portable bootstrap seed string that encodes only the non-secret reach information for the config-home VM (the environment with `role: "main-vm"`).

The seed SHALL use the format `orbion://<kind>:<target>#<name>` where:
- `<kind>` is `ssh` or `direct`
- `<target>` for SSH is `user@host:port`
- `<target>` for direct is the URL
- `<name>` is the environment name (percent-encoded in the fragment)

The seed SHALL NOT contain any secrets, tokens, passwords, or encryption metadata.

#### Scenario: Export with SSH main-VM
- **WHEN** the user triggers export and the main-VM has an SSH endpoint with host `user@prod:22` and name `prod-vm`
- **THEN** the system returns `orbion://ssh:user@prod:22#prod-vm`

#### Scenario: Export with direct main-VM
- **WHEN** the user triggers export and the main-VM has a direct endpoint with URL `http://192.168.1.10:8845` and name `local-daemon`
- **THEN** the system returns `orbion://direct:http://192.168.1.10:8845#local-daemon`

#### Scenario: Export with no main-VM set
- **WHEN** the user triggers export and no environment has `role: "main-vm"`
- **THEN** the system returns an error indicating no main-VM is configured

### Requirement: Import bootstrap seed
The system SHALL allow the user to import a bootstrap seed string on a fresh install to pre-fill the VM wizard's connection step.

The system SHALL parse the seed and extract the reach method, target, and environment name, then pass these as initial values to the AddVmWizard component.

The system SHALL NOT create an environment automatically from the seed; the user MUST still complete the wizard (probing, consent, pairing).

#### Scenario: Import SSH seed
- **WHEN** the user provides `orbion://ssh:deploy@prod-server:22#prod-vm`
- **THEN** the system pre-fills the wizard with reach method `ssh`, target `deploy@prod-server:22`, and environment name `prod-vm`

#### Scenario: Import direct seed
- **WHEN** the user provides `orbion://direct:http://10.0.0.5:8845#my-daemon`
- **THEN** the system pre-fills the wizard with reach method `local`, direct URL `http://10.0.0.5:8845`, and environment name `my-daemon`

#### Scenario: Import invalid seed
- **WHEN** the user provides a string that does not match the expected URI scheme or is malformed
- **THEN** the system shows a validation error without pre-filling any fields

#### Scenario: Import on machine with existing environments
- **WHEN** the user imports a seed but environments already exist
- **THEN** the system still pre-fills the wizard (the seed does not conflict with existing config)

### Requirement: Cold-open import button
The ColdOpen component SHALL display an "Import seed" button alongside the existing "Add a machine" button.

Clicking "Import seed" SHALL open a small input dialog where the user can paste the seed string. On valid input, the wizard opens with pre-filled values.

#### Scenario: Cold-open with import
- **WHEN** the cold-open screen is shown (no environments) and the user clicks "Import seed"
- **THEN** a seed input dialog appears
- **WHEN** the user pastes a valid seed and confirms
- **THEN** the AddVmWizard opens with the seed's reach info pre-filled

### Requirement: Export button on main-VM detail
The InstanceDetail component for the main-VM environment SHALL show an "Export seed" action that copies the bootstrap seed to the clipboard.

#### Scenario: Export from main-VM detail
- **WHEN** the user is viewing the main-VM instance detail and clicks "Export seed"
- **THEN** the seed string is copied to the clipboard and a confirmation is shown
