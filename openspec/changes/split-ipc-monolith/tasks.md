## 1. Create domain files

- [ ] 1.1 Create `src/shared/ipc/types-common.ts` with common types (I18nMessage, ApiRequestArgs, ApiResponse, StreamSubscribeArgs, StreamEventPayload, SessionScope, SessionToken, PairingCodeExchangeResponse, SweepEphemeralSessionsArgs, SweepEphemeralSessionsResult) <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc/types-common.ts] -->

- [ ] 1.2 Create `src/shared/ipc/types-config.ts` with config domain types (ConfigStamp, StaleConfigResult, StampCheckedWriteResult, EndpointKind, AccessEndpoint, EnvironmentAuthState, EnvironmentRole, AgentRuntime, RuntimeState, ReasoningEffort, ModelInfo, ListModelsResult, EnvironmentCredentialRefs, Environment, BootstrapSeed, BootstrapSeedExportResult, BootstrapSeedImportResult, RestoreAvailability, PullRestoreResult, OpenCodeEndpoint, SetOpenCodeEndpointResult, OpenCodeAuthState, OpenCodeErrorKind, OpenCodeConnectionStatus, ConfigBridge, GlobalSettings) <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc/types-config.ts] -->

- [ ] 1.3 Create `src/shared/ipc/types-infra.ts` with infra domain types (PlatformType, DetectPlatformParams, PlatformDetectionResult, InfraAction, CloneRepoParams, CreateIssueParams, CreateIssueResult, ListIssuesParams, IssueCard, ListIssuesResult, MachineStatusEntry, AddLabelParams, AddLabelResult, EditIssueParams, EditIssueResult, BulkRelabelParams, BulkRelabelItemResult, BulkRelabelResult, PrAwaitingReviewItem, PrRiskLevel, PrVerdict, ReviewModeItem, GetPrVerdictParams, GetPrVerdictResult, DiffFileEntry, GetPrDiffParams, GetPrDiffResult, BriefingFileGroup, BriefingSection, GetPrBriefingParams, GetPrBriefingResult, ListPrsAwaitingReviewParams, ListPrsAwaitingReviewResult, PrReviewEvent, SubmitPrReviewParams, SubmitPrReviewResult, OpenPrInBrowserParams, OverlapKind, PrOverlap, ReviewOrderEntry, BatchOverlapResult, InfraActionArgs, InfraActionResult, InfraBridge) <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc/types-infra.ts] -->

- [ ] 1.4 Create `src/shared/ipc/types-connection.ts` with connection domain types (ConnectionPhase, ConnectionStatus, EndpointHealth, TailscalePeer, TailscalePeersResponse, ConnectionBridge, ReachabilityState, ReachabilityStatus, ReachabilityBridge, OutageEscalation, OutageBridge, OpenCodeBridge) <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc/types-connection.ts] -->

- [ ] 1.5 Create `src/shared/ipc/types-chat.ts` with chat domain types (ChatSession, TranscriptMessage, ToolCallRecord, TranscriptBridge, AgentSendPromptArgs, AgentSendPromptResult, AgentStreamEvent, AgentBridge, McpToolInfo, McpToolCallResult, McpConnectionState, McpConnectionStatus, McpBridge) <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc/types-chat.ts] -->

- [ ] 1.6 Create `src/shared/ipc/types-inbox.ts` with inbox domain types + runtime function (InboxItemKind, NotificationType, kindToNotificationType, InboxAction, DigestCounts, InboxItem, InboxItemResolutionReason, ResolvedInboxItem, InboxQueryResult, InboxBridge, DeepLinkTarget, NotificationSendArgs, NotificationBridge) <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc/types-inbox.ts] -->

- [ ] 1.7 Create `src/shared/ipc/types-vm-wizard.ts` with VM wizard domain types (ReachMethod, VmWizardStartOptions, VmWizardStep, VmWizardServiceStatus, VmWizardServiceSelection, SshHost, VmWizardProbeResult, VmWizardLaunchResult, VmWizardTunnelResult, VmWizardPairResult, VmWizardProgress, VmWizardResult, VmWizardBridge) <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc/types-vm-wizard.ts] -->

- [ ] 1.8 Create `src/shared/ipc/types-budget.ts` with budget domain types (BudgetWatch, BudgetBreach, BudgetBridge, WatchConditionKind, WatchTarget, WatchCondition, ConditionWatch, ConditionWatchBridge) <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc/types-budget.ts] -->

- [ ] 1.9 Create `src/shared/ipc/types-loop.ts` with loop domain types (ChainStep, LoopShape, LoopShapeCacheBridge, LoopTaskBridge) <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc/types-loop.ts] -->

- [ ] 1.10 Create `src/shared/ipc/types-security.ts` with security domain types (SecurityAuditEvent, CredentialBridge) <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc/types-security.ts] -->

- [ ] 1.11 Create `src/shared/ipc/types-settings.ts` with settings domain types (SettingsBridge) <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc/types-settings.ts] -->

## 2. Barrel + cleanup

- [ ] 2.1 Create `src/shared/ipc/index.ts` re-exporting all types from domain files, delete `src/shared/ipc.ts` <!-- agent: frontend-engineer.build, depends_on: [1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11], touches: [src/shared/ipc/index.ts, src/shared/ipc.ts] -->

## 3. Verification

- [ ] 3.1 Run `rtk proxy pnpm typecheck`, `rtk proxy pnpm test`, and `rtk proxy pnpm build` — all must pass <!-- agent: frontend-engineer.fast, depends_on: [2.1], touches: [] -->
