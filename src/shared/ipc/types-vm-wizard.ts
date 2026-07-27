import type { I18nMessage } from "./types-common.js";
import type { AgentRuntime } from "./types-config.js";

export type ReachMethod = "local" | "ssh";

export interface VmWizardStartOptions {
  target: string;
  name?: string;
  reachMethod?: ReachMethod;
  directUrl?: string;
  agentRuntime: AgentRuntime;
  sshKeyPassphrase?: string;
}

export type VmWizardStep =
  | "idle"
  | "pick-reach-method"
  | "pick-target"
  | "probing"
  | "host-key-verify"
  | "pick-services"
  | "runtime-provision"
  | "runtime-consent"
  | "installing"
  | "forwarding"
  | "pairing"
  | "consent"
  | "loop-task-consent"
  | "done"
  | "error";

export type VmWizardServiceStatus = "pending" | "skipped" | "already-running" | "installing" | "installed" | "started" | "failed";

export interface VmWizardServiceSelection {
  /** Per-tool install selections, keyed by tool id. See TOOL_DEFINITIONS in tool-definitions.ts. */
  installTools: Record<string, boolean>;
}

export interface SshHost {
  host: string;
  hostName: string;
  user: string;
  port: number;
  identityFile?: string;
  label: string;
}

export interface VmWizardProbeResult {
  reachable: boolean;
  authOk: boolean;
  nodeFound: boolean;
  nodeVersion: string | null;
  loopTaskFound: boolean;
  daemonRunning: boolean;
  daemonPort: number | null;
  opencodeRunning: boolean;
  opencodePort: number | null;
  installedTools: Record<string, boolean>;
  errorDetail: I18nMessage | null;
}

export interface VmWizardLaunchResult {
  started: boolean;
  daemonPort: number | null;
  opencodePort: number | null;
  errorDetail: I18nMessage | null;
  logTail: string | null;
  loopTaskStatus: VmWizardServiceStatus;
  toolStatuses: Record<string, VmWizardServiceStatus>;
}

export interface VmWizardTunnelResult {
  forwarded: boolean;
  localPort: number | null;
  errorDetail: I18nMessage | null;
}

export interface VmWizardPairResult {
  paired: boolean;
  pairingCode: string | null;
  errorDetail: I18nMessage | null;
}

export interface VmWizardProgress {
  step: VmWizardStep;
  message: I18nMessage;
  reachMethod?: ReachMethod | null;
  probe?: VmWizardProbeResult | null;
  launch?: VmWizardLaunchResult | null;
  tunnel?: VmWizardTunnelResult | null;
  pair?: VmWizardPairResult | null;
  consentPrompt?: I18nMessage | null;
  serviceSelection?: VmWizardServiceSelection | null;
  hostKeyFingerprint?: string | null;
  hostKeyLine?: string | null;
}

export interface VmWizardResult {
  environmentId: string;
  environmentName: string;
  daemonUrl: string;
}

export interface VmWizardBridge {
  listSshHosts: () => Promise<SshHost[]>;
  startWizard: (options: VmWizardStartOptions) => Promise<VmWizardResult>;
  onProgress: (cb: (progress: VmWizardProgress) => void) => () => void;
  cancelWizard: () => void;
  respondConsent: (decision: "install" | "skip") => void;
  respondServiceSelection: (selection: VmWizardServiceSelection) => void;
  respondRuntimeConsent: (decision: "install" | "skip") => void;
  respondHostKey: (accepted: boolean) => void;
}
