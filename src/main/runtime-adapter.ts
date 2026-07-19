import type { AgentRuntime, I18nMessage, VmWizardProbeResult, RuntimeState } from "../shared/ipc.js";
import { msg } from "./i18n.js";

export interface RuntimeDetectResult {
  available: boolean;
  reason?: string;
}

export interface RuntimeInstallResult {
  success: boolean;
  errorDetail?: I18nMessage;
}

export interface RuntimeAdapter {
  detect(probe: VmWizardProbeResult): RuntimeDetectResult;
  runtimeLabel(runtime: AgentRuntime): string;
}

function openCodeAdapter(): RuntimeAdapter {
  return {
    detect(probe: VmWizardProbeResult): RuntimeDetectResult {
      if (probe.installedTools.openCode && probe.opencodeRunning) {
        return { available: true };
      }
      if (probe.installedTools.openCode) {
        return { available: false, reason: "opencode installed but not running" };
      }
      return { available: false, reason: "opencode binary not found" };
    },
    runtimeLabel(): string {
      return "OpenCode";
    },
  };
}

function claudeCodeAdapter(): RuntimeAdapter {
  return {
    detect(probe: VmWizardProbeResult): RuntimeDetectResult {
      if (probe.installedTools.claude) {
        return { available: true };
      }
      return { available: false, reason: "claude binary not found" };
    },
    runtimeLabel(): string {
      return "Claude Code";
    },
  };
}

export function createRuntimeAdapter(runtime: AgentRuntime): RuntimeAdapter {
  return runtime === "opencode" ? openCodeAdapter() : claudeCodeAdapter();
}

export function runtimeStateFromDetect(detectResult: RuntimeDetectResult): RuntimeState {
  return detectResult.available ? "available" : "unavailable";
}

export function runtimeDetectMessage(runtime: AgentRuntime, detectResult: RuntimeDetectResult): I18nMessage {
  const adapter = createRuntimeAdapter(runtime);
  const label = adapter.runtimeLabel(runtime);
  if (detectResult.available) {
    return msg("vmWizard.mainRuntimeDetected", { runtime: label });
  }
  return msg("vmWizard.mainRuntimeNotDetected", { runtime: label });
}

export function runtimeConsentMessage(runtime: AgentRuntime): I18nMessage {
  const adapter = createRuntimeAdapter(runtime);
  const label = adapter.runtimeLabel(runtime);
  return msg("vmWizard.mainRuntimeConsentPrompt", { runtime: label });
}

export function runtimeInstallFailedMessage(runtime: AgentRuntime): I18nMessage {
  const adapter = createRuntimeAdapter(runtime);
  const label = adapter.runtimeLabel(runtime);
  return msg("vmWizard.mainRuntimeInstallFailed", { runtime: label });
}
