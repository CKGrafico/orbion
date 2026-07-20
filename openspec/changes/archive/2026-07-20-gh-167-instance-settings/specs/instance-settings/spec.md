## ADDED Requirements

### Requirement: Instance selector offers per-instance settings access
The InstanceSelector dropdown SHALL display a gear icon on each instance row. Clicking the gear icon SHALL open an InstanceSettingsPanel drawer scoped to that instance.

#### Scenario: User opens instance settings from selector
- **WHEN** the user clicks the gear icon on an instance row in the InstanceSelector dropdown
- **THEN** the InstanceSettingsPanel drawer opens on the right side, showing settings for that specific instance
- **AND** the dropdown closes

#### Scenario: Gear icon is not shown when no instances exist
- **WHEN** there are no instances with the current project
- **THEN** the InstanceSelector returns null (no dropdown, no gear icons)

### Requirement: Instance settings panel displays reach section
The InstanceSettingsPanel SHALL display a Reach section showing all endpoints for the instance, with the ability to add a new endpoint, remove an endpoint, and switch the active endpoint.

#### Scenario: User views reach configuration
- **WHEN** the InstanceSettingsPanel is open for an instance with endpoints
- **THEN** the Reach section lists all endpoints with their kind (direct/ssh/tailscale), URL, and last error if any
- **AND** the active endpoint is marked visually

#### Scenario: User adds an alternate endpoint
- **WHEN** the user enters a URL and selects a kind in the "Add endpoint" form and submits
- **THEN** the new endpoint is added to the environment via `config:addEndpoint`
- **AND** the endpoint list refreshes

#### Scenario: User removes an endpoint
- **WHEN** the user clicks a remove button on an endpoint row
- **THEN** a confirmation prompt appears
- **AND** on confirmation, the endpoint is removed via `config:removeEndpoint`
- **AND** if the removed endpoint was active, the next available endpoint becomes active

#### Scenario: User switches active endpoint
- **WHEN** the user selects a different endpoint as active
- **THEN** the active endpoint is changed via `config:setActiveEndpoint`
- **AND** a clean reconnect is triggered for that instance only

### Requirement: Instance settings panel displays runtime section
The InstanceSettingsPanel SHALL display a Runtime section showing the current agent runtime (opencode/claude), the runtime state (available/unavailable/unknown), and a control to switch the runtime.

#### Scenario: User switches agent runtime
- **WHEN** the user selects a different agent runtime in the settings panel
- **THEN** the environment's agentRuntime is updated via `config:updateEnvironment`
- **AND** the runtime switcher in the chat header reflects the change

#### Scenario: User re-provisions runtime
- **WHEN** the user clicks "Re-provision runtime"
- **THEN** the VM wizard is triggered in re-provision mode, re-probing the instance and offering to install the runtime if missing
- **AND** on completion, the runtime state is updated on the environment

### Requirement: Instance settings panel displays credentials section
The InstanceSettingsPanel SHALL display a Credentials section with actions to re-pair (exchange a new pairing code) and clear the session token.

#### Scenario: User re-pairs an instance
- **WHEN** the user enters a new pairing code and submits
- **THEN** the pairing code is exchanged via `config:exchangePairingCode`
- **AND** on success, the session token is stored and authState transitions to "paired"
- **AND** a clean reconnect is triggered for that instance

#### Scenario: User clears session token
- **WHEN** the user clicks "Clear credentials" and confirms
- **THEN** the session token is removed via `config:removeSessionToken`
- **AND** the authState transitions to "unauthenticated"

### Requirement: Instance settings panel provides remove instance action
The InstanceSettingsPanel SHALL provide a destructive "Remove instance" action with a two-step inline confirmation.

#### Scenario: User removes an instance
- **WHEN** the user clicks "Remove instance"
- **THEN** a confirmation prompt appears asking the user to confirm
- **AND** on confirmation, the environment is removed via `config:removeEnvironment`
- **AND** all owned credentials are removed from the vault
- **AND** the settings panel closes
- **AND** the instance disappears from the selector

#### Scenario: User cancels removal
- **WHEN** the user clicks "Remove instance" and then cancels the confirmation
- **THEN** no changes are made and the settings panel remains open

### Requirement: Endpoint or credential changes trigger clean reconnect
When the active endpoint or credentials of an instance change, a clean reconnect SHALL be triggered for that instance only, without affecting other instances.

#### Scenario: Endpoint change triggers reconnect
- **WHEN** the active endpoint is switched
- **THEN** `connection.retry(environmentId)` is called
- **AND** only the affected instance reconnects; other instances are unaffected

#### Scenario: Credential change triggers reconnect
- **WHEN** credentials are updated (re-pair or token clear)
- **THEN** the connection supervisor re-evaluates the instance
- **AND** MCP reconnects on the next agent prompt for that instance

### Requirement: All user-facing copy uses i18n keys
All text displayed in the InstanceSettingsPanel and InstanceSelector gear tooltip SHALL use i18n message keys. No magic strings.

#### Scenario: Settings panel text is localized
- **WHEN** the InstanceSettingsPanel renders
- **THEN** all labels, descriptions, button text, and confirmation prompts use `intl.formatMessage` with i18n keys from `en.json`
