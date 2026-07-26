import type { Environment, EnvironmentHealth, ReachabilityState, AgentRuntime, RuntimeState } from "./types";
import type { OpenCodeConnectionStatus } from "../../shared/ipc";
import i18n, { translateMessage } from "./i18n";

export type RuntimeHealthState =
  | "ok"
  | "not-running"
  | "not-installed"
  | "auth-problem"
  | "unreachable";

export interface RuntimeHealthInfo {
  state: RuntimeHealthState;
  reason: string;
}

export function deriveRuntimeHealth(
  environment: Environment,
  health: EnvironmentHealth,
  reachability: ReachabilityState | undefined,
  openCodeStatus: OpenCodeConnectionStatus | undefined,
  runtimeState: RuntimeState | undefined,
): RuntimeHealthInfo {
  if (reachability === "unreachable" || reachability === "reconnecting") {
    return {
      state: "unreachable",
      reason: i18n.t("runtimeHealth.unreachableReason"),
    };
  }

  if (health !== "ok") {
    if (runtimeState === "unavailable") {
      return {
        state: "not-installed",
        reason: i18n.t("runtimeHealth.notInstalledReason"),
      };
    }
    return {
      state: "unreachable",
      reason: i18n.t("runtimeHealth.daemonDownReason"),
    };
  }

  const agentRuntime = environment.agentRuntime;

  if (agentRuntime === "opencode" && openCodeStatus) {
    return deriveOpenCodeHealth(openCodeStatus, runtimeState);
  }

  return deriveFromRuntimeState(runtimeState, agentRuntime);
}

function deriveOpenCodeHealth(
  status: OpenCodeConnectionStatus,
  runtimeState: RuntimeState | undefined,
): RuntimeHealthInfo {
  if (status.errorKind === "unauthenticated") {
    return {
      state: "auth-problem",
      reason: extractErrorMessage(status.errorMessage)
        ?? i18n.t("runtimeHealth.authProblemReason"),
    };
  }

  if (status.errorKind === "rejected") {
    return {
      state: "auth-problem",
      reason: extractErrorMessage(status.errorMessage)
        ?? i18n.t("runtimeHealth.rejectedReason"),
    };
  }

  if (status.errorKind === "unreachable") {
    if (runtimeState === "unavailable") {
      return {
        state: "not-installed",
        reason: i18n.t("runtimeHealth.notInstalledReason"),
      };
    }
    return {
      state: "not-running",
      reason: extractErrorMessage(status.errorMessage)
        ?? i18n.t("runtimeHealth.notRunningReason"),
    };
  }

  if (status.errorKind === "version") {
    return {
      state: "not-running",
      reason: extractErrorMessage(status.errorMessage)
        ?? i18n.t("runtimeHealth.versionTooOldReason"),
    };
  }

  if (status.authState === "authenticated") {
    return {
      state: "ok",
      reason: i18n.t("runtimeHealth.okReason"),
    };
  }

  if (status.authState === "unauthenticated") {
    return {
      state: "auth-problem",
      reason: i18n.t("runtimeHealth.authProblemReason"),
    };
  }

  return deriveFromRuntimeState(runtimeState, "opencode");
}

function deriveFromRuntimeState(
  runtimeState: RuntimeState | undefined,
  agentRuntime: AgentRuntime | undefined,
): RuntimeHealthInfo {
  const label = agentRuntime === "claude" ? "Claude Code" : agentRuntime === "opencode" ? "OpenCode" : "Runtime";

  switch (runtimeState) {
    case "available":
      return {
        state: "ok",
        reason: i18n.t("runtimeHealth.okReason"),
      };
    case "unavailable":
      return {
        state: "not-installed",
        reason: i18n.t("runtimeHealth.notInstalledLabelReason", { label }),
      };
    case "unknown":
    default:
      return {
        state: "not-running",
        reason: i18n.t("runtimeHealth.unknownReason", { label }),
      };
  }
}

function extractErrorMessage(msg: string | import("../../shared/ipc").I18nMessage | null): string | null {
  if (!msg) return null;
  const result = translateMessage(msg);
  return result || null;
}

export const RUNTIME_HEALTH_COLORS: Record<RuntimeHealthState, string> = {
  ok: "var(--health-ok)",
  "not-running": "var(--health-connecting)",
  "not-installed": "var(--health-offline)",
  "auth-problem": "var(--health-blocked)",
  unreachable: "var(--health-unknown)",
};
