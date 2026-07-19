## ADDED Requirements

### Requirement: In-flight generation is interrupted before instance switch

The system SHALL interrupt any in-flight agent generation on the **old** instance before committing the instance switch. When the user selects a new instance while an agent turn is streaming, the system MUST call the interrupt function targeting the old environment's agent session, await its completion, and only then update the session's `environmentId` and `workingDirectory`.

#### Scenario: Switching instance during active streaming
- **WHEN** the user selects a different instance in the InstanceSelector while an agent turn is streaming
- **THEN** the system interrupts the active generation on the old instance
- **AND** the interrupted turn shows an interrupted state in the transcript
- **AND** the session's `environmentId` updates to the new instance only after the interrupt completes
- **AND** the sidebar filing (project) does not change

#### Scenario: Switching instance while no generation is active
- **WHEN** the user selects a different instance while no agent turn is streaming
- **THEN** the session's `environmentId` updates immediately
- **AND** no interrupt call is made

### Requirement: Per-message instance attribution

Each `TranscriptMessage` SHALL carry an optional `environmentId` field indicating which instance produced that message. When a new message is appended to the transcript (user or assistant), the system MUST record the session's current `environmentId` on that message.

#### Scenario: Message attribution on new session
- **WHEN** a user sends a message on an instance with ID "env-1"
- **THEN** the appended user message and the resulting assistant message both carry `environmentId: "env-1"`

#### Scenario: Message attribution after instance switch
- **WHEN** the user switches from "env-1" to "env-2" and then sends a message
- **THEN** messages after the switch carry `environmentId: "env-2"`
- **AND** messages before the switch retain `environmentId: "env-1"`

#### Scenario: Legacy messages without environmentId
- **WHEN** the transcript contains messages persisted before this feature was added (no `environmentId` field)
- **THEN** those messages display without an instance attribution label
- **AND** no error or fallback rendering failure occurs

### Requirement: Handoff divider marks the switch point

The system SHALL render an explicit visual divider in the transcript when an instance switch occurs. The divider MUST be a distinct row (not a chat bubble) showing the old and new instance names, clearly marking the handoff boundary.

#### Scenario: Instance switch adds a handoff divider
- **WHEN** the user switches from instance "dev-vm" to instance "prod-vm"
- **THEN** a handoff divider row appears in the transcript between the last message on "dev-vm" and the next message on "prod-vm"
- **AND** the divider displays text indicating the switch from "dev-vm" to "prod-vm"
- **AND** the divider is visually distinct from chat messages (e.g., centered, muted, with separator lines)

#### Scenario: Handoff divider does not produce a chat turn
- **WHEN** a handoff divider is rendered
- **THEN** it is NOT paired as an assistant-turn response to any user message
- **AND** it does not have an avatar or message bubble styling

### Requirement: Assistant messages display instance attribution

The system SHALL display a compact "on \<instance-name\>" label on assistant message rows, indicating which instance produced that response. The label MUST be visible but visually secondary to the message content.

#### Scenario: Attribution label on assistant message
- **WHEN** an assistant message has an `environmentId` field
- **THEN** the renderer displays "on \<instance-name\>" next to or below the message content
- **AND** the instance name is resolved from the environments list

#### Scenario: Attribution label absent for legacy messages
- **WHEN** an assistant message has no `environmentId` field
- **THEN** no attribution label is displayed

### Requirement: MCP endpoint reconnects on switch

The system SHALL trigger an MCP connection check/refresh for the new instance after the switch completes. This ensures the agent's available tool set updates to reflect the new instance's MCP server.

#### Scenario: MCP tools refresh after switch
- **WHEN** the user switches to a new instance
- **THEN** the system calls `mcpService.connect(newEnvironmentId)` after the session update
- **AND** the MCP status chip in the chat header reflects the connection state of the new instance

#### Scenario: MCP connect fails after switch
- **WHEN** the MCP connection to the new instance fails
- **THEN** the MCP status chip shows the error/unreachable state
- **AND** the switch still completes (session re-pointed, divider shown)
