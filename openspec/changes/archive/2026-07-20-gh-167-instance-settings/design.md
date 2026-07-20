## Context

Orbion's InstanceSelector (in the chat header) displays instances hosting the current session's project. Currently, once an instance is added via the AddVmWizard, its configuration (reach, runtime, credentials) is immutable; the only option is to remove and re-add. The session model intentionally keeps instances out of the sidebar, surfacing them only in the chat header. Per-instance settings must therefore be reachable from the selector itself.

The existing SettingsPanel is a right-side drawer for global app preferences. The InstanceSettingsPanel follows the same visual pattern but scoped to a single environment, opened from a gear icon on the instance row in the dropdown.

## Goals / Non-Goals

**Goals:**
- Provide an InstanceSettingsPanel drawer reachable from a gear icon on each instance row in the InstanceSelector dropdown.
- Allow editing: instance name, reach method (add/remove/switch endpoints), agent runtime, credentials (re-pair, clear token), and instance removal.
- Changes to reach or credentials trigger a clean reconnect for that instance only.
- Preserve the existing add-VM wizard for new-instance creation.
- Keep mock adapter working.

**Non-Goals:**
- Full VM wizard re-run from settings (edit mode wizard). Instead, offer "Re-provision runtime" as a re-probe + re-install trigger scoped to the runtime section, using the existing `vmWizard.startWizard` flow.
- Instance listing in the sidebar (explicitly rejected by the design model).
- Editing SSH tunnel parameters beyond what the endpoint model supports (add/remove endpoints covers this).
- Global settings panel changes (out of scope).

## Decisions

1. **Gear icon on instance row, not a detail page.** The instance selector already shows instances in the chat header. Adding a gear icon that opens the settings drawer keeps the interaction inline with the "instances re-enter only in the chat header" design rule. A separate settings page or sidebar section would violate it.

2. **Drawer, not modal.** The settings panel is complex enough to need vertical space. A right-side drawer (matching SettingsPanel) gives that space while keeping context visible.

3. **Reuse existing IPC channels where possible.** `addEndpoint`, `removeEndpoint`, `setActiveEndpoint`, `removeEnvironment`, `removeSessionToken`, `exchangePairingCode` already exist. The only new channel is `config:updateEnvironment` for updating name and agentRuntime on an existing environment.

4. **`updateEnvironment` uses `mutateEnvironment` pattern.** The config-store already has this pattern for internal mutations. The public `updateEnvironment(envId, { name?, agentRuntime? })` wraps `mutateEnvironment` with the same serialization queue (`serialize()`).

5. **Clean reconnect on endpoint/credential change.** When the active endpoint changes, `connection.retry(envId)` is called to force an immediate re-probe. When credentials change (re-pair or token clear), the connection supervisor re-evaluates, and MCP reconnects on the next agent prompt. No full app restart needed.

6. **Runtime re-provision reuses VM wizard.** A "Re-provision runtime" button in the runtime section calls the existing VM wizard flow (`vmWizard.startWizard`) with the environment's current SSH target and a flag to skip the daemon install step. This re-probes, offers install if missing, and updates the `runtimeState` on the environment.

7. **Destructive remove action with confirmation.** Removing an instance uses a two-step inline confirmation (same pattern as loop card destructive actions). It calls `removeEnvironment` which also removes owned credentials from the vault.

## Risks / Trade-offs

- **Gear icon may be undiscoverable** if users expect settings in a global panel. Mitigation: the gear is a well-understood affordance; tooltip text clarifies its purpose.
- **Ephemeral editor state lost on dropdown close.** The drawer is independent of the dropdown; closing the dropdown does not close the drawer. This is consistent with how the global SettingsPanel works.
- **Re-provision runtime is heavyweight.** Re-running the wizard for runtime changes is the existing flow; creating a lighter-weight "just re-probe runtime" path would be a follow-up enhancement.
