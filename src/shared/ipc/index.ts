// Common types
export type {
  I18nMessage,
  ApiRequestArgs,
  ApiResponse,
  StreamSubscribeArgs,
  StreamEventPayload,
  SessionScope,
  SessionToken,
  PairingCodeExchangeResponse,
  SweepEphemeralSessionsArgs,
  SweepEphemeralSessionsResult,
  LogBridge,
} from "./types-common.js";

// Config domain
export type {
  EndpointKind,
  AccessEndpoint,
  EnvironmentAuthState,
  EnvironmentRole,
  AgentRuntime,
  RuntimeState,
  ReasoningEffort,
  ModelInfo,
  ListModelsResult,
  EnvironmentCredentialRefs,
  OpenCodeAuthState,
  OpenCodeErrorKind,
  OpenCodeConnectionStatus,
  OpenCodeEndpoint,
  SetOpenCodeEndpointResult,
  Environment,
  BootstrapSeed,
  BootstrapSeedExportResult,
  BootstrapSeedImportResult,
  RestoreAvailability,
  PullRestoreResult,
  ConfigStamp,
  StaleConfigResult,
  StampCheckedWriteResult,
  GlobalSettings,
  ConfigBridge,
} from "./types-config.js";

// Infra domain
export type {
  PlatformType,
  DetectPlatformParams,
  PlatformDetectionResult,
  InfraAction,
  CloneRepoParams,
  CreateIssueParams,
  CreateIssueResult,
  ListIssuesParams,
  IssueCard,
  ListIssuesResult,
  MachineStatusEntry,
  AddLabelParams,
  AddLabelResult,
  EditIssueParams,
  EditIssueResult,
  BulkRelabelParams,
  BulkRelabelItemResult,
  BulkRelabelResult,
  PrAwaitingReviewItem,
  PrRiskLevel,
  PrVerdict,
  ReviewModeItem,
  GetPrVerdictParams,
  GetPrVerdictResult,
  DiffFileEntry,
  GetPrDiffParams,
  GetPrDiffResult,
  BriefingFileGroup,
  BriefingSection,
  GetPrBriefingParams,
  GetPrBriefingResult,
  ListPrsAwaitingReviewParams,
  ListPrsAwaitingReviewResult,
  PrReviewEvent,
  SubmitPrReviewParams,
  SubmitPrReviewResult,
  OpenPrInBrowserParams,
  OverlapKind,
  PrOverlap,
  ReviewOrderEntry,
  BatchOverlapResult,
  InfraActionArgs,
  InfraActionResult,
  InfraBridge,
} from "./types-infra.js";

// Connection domain
export type {
  ConnectionPhase,
  ConnectionStatus,
  EndpointHealth,
  TailscalePeer,
  TailscalePeersResponse,
  ConnectionBridge,
  ReachabilityState,
  ReachabilityStatus,
  ReachabilityBridge,
  OutageEscalation,
  OutageBridge,
  OpenCodeBridge,
} from "./types-connection.js";

// Chat domain
export type {
  ChatSession,
  ToolCallRecord,
  TranscriptMessage,
  TranscriptBridge,
  AgentSendPromptArgs,
  AgentStreamEvent,
  AgentSendPromptResult,
  AgentBridge,
  McpToolInfo,
  McpToolCallResult,
  McpConnectionState,
  McpConnectionStatus,
  McpBridge,
} from "./types-chat.js";

// Inbox domain (includes runtime function)
export type {
  InboxItemKind,
  NotificationType,
  InboxAction,
  DigestCounts,
  InboxItem,
  InboxItemResolutionReason,
  ResolvedInboxItem,
  InboxQueryResult,
  InboxBridge,
  DeepLinkTarget,
  NotificationSendArgs,
  NotificationBridge,
} from "./types-inbox.js";
export { kindToNotificationType } from "./types-inbox.js";

// VM Wizard domain
export type {
  ReachMethod,
  VmWizardStartOptions,
  VmWizardStep,
  VmWizardServiceStatus,
  VmWizardServiceSelection,
  SshHost,
  VmWizardProbeResult,
  VmWizardLaunchResult,
  VmWizardTunnelResult,
  VmWizardPairResult,
  VmWizardProgress,
  VmWizardResult,
  VmWizardBridge,
} from "./types-vm-wizard.js";

// Budget domain
export type {
  BudgetWatch,
  BudgetBreach,
  BudgetBridge,
  WatchConditionKind,
  WatchTarget,
  WatchCondition,
  ConditionWatch,
  ConditionWatchBridge,
} from "./types-budget.js";

// Loop domain
export type {
  ChainStep,
  LoopShape,
  LoopShapeCacheBridge,
} from "./types-loop.js";

// Security domain
export type {
  SecurityAuditEvent,
  CredentialBridge,
} from "./types-security.js";

// Settings domain
export type { SettingsBridge } from "./types-settings.js";

// Composite bridge — depends on all sub-bridges
import type { ApiRequestArgs, ApiResponse, StreamSubscribeArgs, StreamEventPayload, LogBridge } from "./types-common.js";
import type { ConfigBridge } from "./types-config.js";
import type { InfraBridge } from "./types-infra.js";
import type { ConnectionBridge, OpenCodeBridge, TailscalePeersResponse, ReachabilityBridge, OutageBridge } from "./types-connection.js";
import type { AgentBridge, TranscriptBridge, McpBridge } from "./types-chat.js";
import type { InboxBridge, NotificationBridge } from "./types-inbox.js";
import type { VmWizardBridge } from "./types-vm-wizard.js";
import type { BudgetBridge, ConditionWatchBridge } from "./types-budget.js";
import type { LoopShapeCacheBridge } from "./types-loop.js";
import type { CredentialBridge } from "./types-security.js";
import type { SettingsBridge } from "./types-settings.js";
import type { SiblingDeclineBridge } from "../sibling-offer-types.js";

export interface LoopTaskBridge {
  request: <T = unknown>(args: ApiRequestArgs) => Promise<ApiResponse<T>>;
  subscribeStream: (args: StreamSubscribeArgs) => Promise<void>;
  unsubscribeStream: (subId: string) => Promise<void>;
  onStreamEvent: (cb: (payload: StreamEventPayload) => void) => () => void;
  config: ConfigBridge;
  connection: ConnectionBridge;
  opencode: OpenCodeBridge;
  tailscalePeers: () => Promise<TailscalePeersResponse>;
  vmWizard: VmWizardBridge;
  infra: InfraBridge;
  budget: BudgetBridge;
  inbox: InboxBridge;
  watch: ConditionWatchBridge;
  notification: NotificationBridge;
  outage: OutageBridge;
  reachability: ReachabilityBridge;
  transcript: TranscriptBridge;
  mcp: McpBridge;
  agent: AgentBridge;
  loopShapeCache: LoopShapeCacheBridge;
  siblingDecline: SiblingDeclineBridge;
  settings: SettingsBridge;
  log: LogBridge;
  credential: CredentialBridge;
}
