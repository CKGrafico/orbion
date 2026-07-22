# environment-agent-runtime Specification

## Purpose
TBD - created by archiving change gh-81-agent-runtime-keychain. Update Purpose after archive.
## Requirements
### Requirement: Wizard requires an agent runtime
The add-environment wizard SHALL require the user to choose exactly one agent runtime from OpenCode and Claude Code before starting environment setup.

#### Scenario: User selects OpenCode
- **WHEN** the user selects OpenCode and completes the wizard
- **THEN** the created environment records OpenCode as its agent runtime

#### Scenario: User selects Claude Code
- **WHEN** the user selects Claude Code and completes the wizard
- **THEN** the created environment records Claude Code as its agent runtime

### Requirement: Environment runtime is the chat default
The system SHALL expose the persisted environment agent runtime as the default agent for chats homed on that environment.

#### Scenario: Chat resolves its home environment default
- **WHEN** a chat is homed on an environment with a persisted agent runtime
- **THEN** the chat default agent equals that environment's runtime

### Requirement: Selected remote runtime is available
For SSH setup, the wizard SHALL require installation of the selected runtime when it is not already installed and SHALL NOT require installation of the unselected runtime.

#### Scenario: Selected runtime is missing
- **WHEN** the selected runtime is not detected on the target VM
- **THEN** the service selection marks that runtime for installation before the environment is saved

#### Scenario: Unselected runtime is missing
- **WHEN** the unselected runtime is not detected on the target VM
- **THEN** the service selection does not select it by default

### Requirement: Frontend engineer agent uses shadcn skill
The `frontend-engineer` agent SHALL list `@shadcn` under its `## Abilities > Development` section and SHALL NOT list `@accelint-design-foundation`. The shadcn skill provides guidance for working with shadcn/ui components and Tailwind CSS v4.

#### Scenario: Frontend engineer loads shadcn skill
- **WHEN** the frontend-engineer agent starts
- **THEN** it loads `@shadcn` skill and uses shadcn/ui as the primary component library
- **AND** it does NOT load `@accelint-design-foundation`

#### Scenario: Skills lock includes shadcn entry
- **WHEN** `skills-lock.json` is inspected
- **THEN** it contains a `shadcn` or `shadcn/ui` entry with the correct source reference

