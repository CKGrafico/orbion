## Why

Users can currently view instances in the chat-header selector, but any configuration (reach method, runtime, credentials) must be done through the global AddVmWizard at creation time. There is no way to edit an existing instance's reach, re-provision its runtime, update credentials, or remove it without deleting and re-adding. The session model treats instances as the "where it runs" knob in the chat header, so per-instance settings belong there, not in a separate global panel.

## What Changes

- The instance selector dropdown gains a gear icon on each instance row that opens an **InstanceSettingsPanel** for that specific instance.
- The InstanceSettingsPanel is a right-side drawer (same pattern as SettingsPanel) scoped to one instance, with sections for:
  - **Reach**: view/edit the endpoint (local URL or SSH target), add/remove alternate endpoints, switch active endpoint.
  - **Runtime**: view/switch the agent runtime (opencode/claude), re-provision runtime on the VM (triggers the VM wizard in edit mode, re-probing and re-installing), view runtime state.
  - **Credentials**: re-pair (exchange a new pairing code), clear session token, update SSH key passphrase.
  - **Remove instance**: destructive action with confirmation, removes the environment and all owned credentials.
- Changes to reach or credentials trigger a clean reconnect of that instance only (connection supervisor retry, MCP reconnect, agent interrupt if mid-session on that instance).
- All user-facing copy goes through i18n keys.

## Capabilities

### New Capabilities
- `instance-settings`: Per-instance settings view reachable from the instance selector, with sections for reach, runtime, credentials, and removal.

### Modified Capabilities

## Impact

- **Renderer**: New `InstanceSettingsPanel` component, modifications to `InstanceSelector` to add gear icon and open callback, new i18n keys.
- **Main process**: New IPC channel `config:updateEnvironment` for updating instance name/agentRuntime. Existing `config:addEndpoint`, `config:removeEndpoint`, `config:setActiveEndpoint`, `config:removeEnvironment`, `config:removeSessionToken` are reused.
- **IPC contract** (`src/shared/ipc.ts`): New `ConfigBridge.updateEnvironment` method, new `updateEnvironment` IPC handler.
- **Config store** (`src/main/config-store.ts`): New `_updateEnvironment` / `updateEnvironment` with `mutateEnvironment` pattern.
- **Preload**: Wire new `config:updateEnvironment` IPC channel.
- **Services**: `IConfigService` gains `updateEnvironment`, ConfigService impl and MockServices updated.
- **Connection/MCP**: On endpoint or credential change, trigger reconnect for the affected instance only.
