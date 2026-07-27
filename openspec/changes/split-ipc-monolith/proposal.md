## Why

`src/shared/ipc.ts` is a 1087-line monolith containing 50+ type exports, 1 runtime function (`kindToNotificationType`), and 19 bridge interfaces. This violates GR-CODE-001 ("each file should have one clear responsibility") and creates a tree-shaking problem: any renderer import of a single type from `ipc.ts` pulls the `kindToNotificationType` runtime code into the bundle. The file is 75% of all shared code.

## What Changes

- Split `ipc.ts` into domain-specific files under `src/shared/ipc/`:
  - `types-common.ts` — `I18nMessage`, `ApiRequestArgs`, `ApiResponse`, `StreamSubscribeArgs`, `StreamEventPayload`, `SessionScope`, `SessionToken`, `PairingCodeExchangeResponse`, `SweepEphemeralSessionsArgs`, `SweepEphemeralSessionsResult`
  - `types-config.ts` — `ConfigBridge`, `ConfigStamp`, `StaleConfigResult`, `StampCheckedWriteResult`, `Environment` and related types (`EndpointKind`, `AccessEndpoint`, `EnvironmentAuthState`, `EnvironmentRole`, `AgentRuntime`, `RuntimeState`, `ReasoningEffort`, `ModelInfo`, `ListModelsResult`, `EnvironmentCredentialRefs`, `BootstrapSeed`, `BootstrapSeedExportResult`, `BootstrapSeedImportResult`, `RestoreAvailability`, `PullRestoreResult`, `OpenCodeEndpoint`, `SetOpenCodeEndpointResult`, `OpenCodeAuthState`, `OpenCodeErrorKind`, `OpenCodeConnectionStatus`, `GlobalSettings`)
  - `types-infra.ts` — `InfraBridge` and all infra action types (issue, PR, review, platform, diff, overlap types)
  - `types-connection.ts` — `ConnectionBridge`, `ConnectionPhase`, `ConnectionStatus`, `EndpointHealth`, `TailscalePeer`, `TailscalePeersResponse`, `ReachabilityBridge`, `ReachabilityState`, `ReachabilityStatus`, `OutageBridge`, `OutageEscalation`, `OpenCodeBridge`
  - `types-chat.ts` — `ChatSession`, `TranscriptBridge`, `TranscriptMessage`, `ToolCallRecord`, `AgentBridge`, `AgentSendPromptArgs`, `AgentSendPromptResult`, `AgentStreamEvent`, `McpBridge`, `McpToolInfo`, `McpToolCallResult`, `McpConnectionState`, `McpConnectionStatus`
  - `types-inbox.ts` — `InboxBridge`, `NotificationBridge`, `InboxItemKind`, `NotificationType`, `kindToNotificationType`, `InboxAction`, `DigestCounts`, `InboxItem`, `InboxItemResolutionReason`, `ResolvedInboxItem`, `InboxQueryResult`, `DeepLinkTarget`, `NotificationSendArgs`
  - `types-vm-wizard.ts` — `VmWizardBridge`, `SshHost`, `ReachMethod`, `VmWizardStartOptions`, `VmWizardStep`, `VmWizardServiceStatus`, `VmWizardServiceSelection`, `VmWizardProbeResult`, `VmWizardLaunchResult`, `VmWizardTunnelResult`, `VmWizardPairResult`, `VmWizardProgress`, `VmWizardResult`
  - `types-budget.ts` — `BudgetBridge`, `BudgetWatch`, `BudgetBreach`, `ConditionWatchBridge`, `WatchConditionKind`, `WatchTarget`, `WatchCondition`, `ConditionWatch`
  - `types-loop.ts` — `LoopShapeCacheBridge`, `LoopShape`, `ChainStep`, `LoopTaskBridge`
  - `types-security.ts` — `CredentialBridge`, `SecurityAuditEvent`
  - `types-settings.ts` — `SettingsBridge`
  - `index.ts` — re-exports everything
- Delete `src/shared/ipc.ts` (replaced by `src/shared/ipc/` directory)
- All 94 consumer import paths (`../shared/ipc` or `../shared/ipc.js`) resolve identically to `index.ts`

## Capabilities

### New Capabilities
- `ipc-domain-split`: domain-specific file organization enabling tree-shaking of runtime code from type-only imports

### Modified Capabilities

_(none — no behavioral change, pure refactor)_

## Impact

- `src/shared/ipc.ts`: deleted (replaced by directory)
- `src/shared/ipc/`: 12 new domain files + `index.ts`
- All consumers: no changes needed (import paths resolve identically)
- `kindToNotificationType` consumers can optionally import from `types-inbox.ts` for explicit tree-shaking benefit
