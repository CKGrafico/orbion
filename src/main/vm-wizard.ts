import type { AgentRuntime, SshHost, VmWizardProgress, VmWizardResult, VmWizardPairResult, VmWizardProbeResult, VmWizardServiceSelection, I18nMessage, ReachMethod, SessionToken, VmWizardStartOptions, RuntimeState } from "../shared/ipc.js";
import { TOOL_DEFINITIONS } from "../shared/tool-definitions.js";
import { listSshHosts, parseTarget, isHostInKnownHosts, fetchHostKey, appendToKnownHosts } from "./ssh-config.js";
import { probeVm, installNodeViaMise } from "./ssh-probe.js";
import { launchOnVm, createPairingCodeOnRemote } from "./ssh-launch.js";
import { getEnvironments, addEnvironment, removeEnvironment, exchangePairingCode, storeSessionToken, storeSshKeyPassphrase, setOpenCodeEndpoint, autoPromoteFirstEnvIfNeeded, setEnvironmentRuntimeState } from "./config-store.js";
import { getMainWindow } from "./main-window.js";
import { msg } from "./i18n.js";
import { fetchAndUnwrap } from "./http-utils.js";
import { trimTrailingSlash } from "../shared/utils.js";
import { createRuntimeAdapter, runtimeDetectMessage, runtimeConsentMessage } from "./runtime-adapter.js";

let wizardCancelled = false;
let consentResolver: ((decision: "install" | "skip") => void) | null = null;
let serviceSelectionResolver: ((selection: VmWizardServiceSelection) => void) | null = null;
let runtimeConsentResolver: ((decision: "install" | "skip") => void) | null = null;
let hostKeyResolver: ((accepted: boolean) => void) | null = null;

export function cancelWizard(): void {
  wizardCancelled = true;
}

export function isWizardCancelled(): boolean {
  return wizardCancelled;
}

export function resetWizardState(): void {
  wizardCancelled = false;
  consentResolver = null;
  serviceSelectionResolver = null;
  runtimeConsentResolver = null;
  hostKeyResolver = null;
}

export function respondConsent(decision: "install" | "skip"): void {
  if (consentResolver) {
    consentResolver(decision);
    consentResolver = null;
  }
}

export function respondServiceSelection(selection: VmWizardServiceSelection): void {
  if (serviceSelectionResolver) {
    serviceSelectionResolver(selection);
    serviceSelectionResolver = null;
  }
}

export function respondRuntimeConsent(decision: "install" | "skip"): void {
  if (runtimeConsentResolver) {
    runtimeConsentResolver(decision);
    runtimeConsentResolver = null;
  }
}

export function respondHostKey(accepted: boolean): void {
  if (hostKeyResolver) {
    hostKeyResolver(accepted);
    hostKeyResolver = null;
  }
}

export { listSshHosts };

function emitProgress(progress: VmWizardProgress): void {
  const win = getMainWindow();
  if (win) {
    win.webContents.send("vmWizard:progress", progress);
  }
}

function runtimeToolId(agentRuntime: AgentRuntime): "openCode" | "claude" {
  return agentRuntime === "opencode" ? "openCode" : "claude";
}

async function askServiceSelection(probe: VmWizardProbeResult, agentRuntime: AgentRuntime, reachMethod: ReachMethod = "ssh"): Promise<VmWizardServiceSelection> {
  // loop-task is mandatory (always installed). Defaults: install if not already detected.
  const installTools: Record<string, boolean> = {};
  const selectedRuntimeToolId = runtimeToolId(agentRuntime);
  for (const tool of TOOL_DEFINITIONS) {
    const isRuntime = tool.id === "openCode" || tool.id === "claude";
    installTools[tool.id] = isRuntime
      ? tool.id === selectedRuntimeToolId && !probe.installedTools[tool.id]
      : !probe.installedTools[tool.id];
  }

  const defaultSelection: VmWizardServiceSelection = {
    installTools,
  };
  emitProgress({
    step: "pick-services",
    message: msg("vmWizard.stepPickServices"),
    reachMethod,
    probe,
    serviceSelection: defaultSelection,
  });

  try {
    const selection = await new Promise<VmWizardServiceSelection>((resolve) => {
      serviceSelectionResolver = resolve;
    });

    if (wizardCancelled) throw new Error("vmWizard.mainCancelled");
    if (!probe.installedTools[selectedRuntimeToolId]) {
      return {
        installTools: {
          ...selection.installTools,
          [selectedRuntimeToolId]: true,
        },
      };
    }
    return selection;
  } finally {
    serviceSelectionResolver = null;
  }
}

async function askConsent(
  prompt: I18nMessage,
  probe: VmWizardProbeResult,
  reachMethod: ReachMethod = "ssh",
  step: "consent" | "loop-task-consent" = "consent",
): Promise<"install" | "skip"> {
  emitProgress({
    step,
    message: prompt,
    reachMethod,
    probe,
    consentPrompt: prompt,
  });

  try {
    const decision = await new Promise<"install" | "skip">((resolve) => {
      consentResolver = resolve;
    });

    if (wizardCancelled) {
      throw new Error("vmWizard.mainCancelled");
    }

    return decision;
  } finally {
    consentResolver = null;
  }
}

async function persistWizardCredentials(
  environmentId: string,
  sshKeyPassphrase: string | undefined,
  sessionToken: SessionToken | null,
  reachMethod: ReachMethod,
): Promise<void> {
  const hasPassphrase = sshKeyPassphrase !== undefined && sshKeyPassphrase.trim().length > 0;
  if (hasPassphrase && !await storeSshKeyPassphrase(environmentId, sshKeyPassphrase)) {
    await rollbackCredentialPersistence(environmentId, reachMethod);
  }
  if (sessionToken && !await storeSessionToken(environmentId, sessionToken)) {
    await rollbackCredentialPersistence(environmentId, reachMethod);
  }
}

async function rollbackCredentialPersistence(environmentId: string, reachMethod: ReachMethod): Promise<never> {
  await removeEnvironment(environmentId);
  emitProgress({
    step: "error",
    message: msg("vmWizard.mainCredentialEncryptionUnavailable"),
    reachMethod,
    probe: null,
  });
  throw new Error("vmWizard.mainCredentialEncryptionUnavailable");
}

export async function runWizard(options: VmWizardStartOptions): Promise<VmWizardResult> {
  resetWizardState();
  const { target, name, reachMethod = "ssh", directUrl, agentRuntime, sshKeyPassphrase } = options;

  if (reachMethod === "local") {
    return runLocalWizard(name ?? "Local", directUrl, agentRuntime, sshKeyPassphrase);
  }

  // ── SSH path (original logic) ──────────────────────────────────────
  let host: SshHost | null = parseTarget(target);
  if (!host) {
    const knownHosts = listSshHosts();
    host = knownHosts.find((h) => h.host === target || h.label === target) ?? null;
  }

  if (!host) {
    emitProgress({
      step: "error",
      message: msg("vmWizard.mainInvalidTarget", { target }),
      reachMethod: "ssh",
      probe: null,
    });
    throw new Error("vmWizard.mainInvalidTarget");
  }

  const envName = name ?? host.hostName ?? host.host;

  // Duplicate guard: reject if an environment with the same SSH target already exists
  const existingEnvs = getEnvironments();
  const duplicateBySshTarget = existingEnvs.find((e) =>
    e.endpoints.some((ep) => ep.sshTarget === host!.label)
  );
  if (duplicateBySshTarget) {
    emitProgress({
      step: "error",
      message: msg("vmWizard.mainAlreadyExists", { name: duplicateBySshTarget.name }),
      reachMethod: "ssh",
      probe: null,
    });
    throw new Error("vmWizard.mainAlreadyExists");
  }

  // Step 0: Host key verification (skip if host is already trusted)
  const hostAlreadyTrusted = isHostInKnownHosts(host.hostName, host.port);
  if (!hostAlreadyTrusted) {
    emitProgress({ step: "host-key-verify", message: msg("vmWizard.mainHostKeyFetching", { label: host.label }), reachMethod: "ssh" });

    const hostKeyResult = await fetchHostKey(host.hostName, host.port);

    if (hostKeyResult) {
      emitProgress({
        step: "host-key-verify",
        message: msg("vmWizard.mainHostKeyConfirm", { label: host.label }),
        reachMethod: "ssh",
        hostKeyFingerprint: hostKeyResult.fingerprint ?? hostKeyResult.rawLines,
        hostKeyLine: hostKeyResult.rawLines,
      });

      let accepted: boolean;
      try {
        accepted = await new Promise<boolean>((resolve) => {
          hostKeyResolver = resolve;
        });
      } finally {
        hostKeyResolver = null;
      }

      if (wizardCancelled) {
        emitProgress({ step: "error", message: msg("vmWizard.mainWizardCancelled"), reachMethod: "ssh" });
        throw new Error("vmWizard.mainCancelled");
      }

      if (!accepted) {
        emitProgress({
          step: "error",
          message: msg("vmWizard.mainHostKeyRejected"),
          reachMethod: "ssh",
          probe: null,
        });
        throw new Error("vmWizard.mainHostKeyRejected");
      }

      // User accepted the key; write it to known_hosts so subsequent SSH
      // connections (probe, launch, tunnel) will verify against it.
      appendToKnownHosts(hostKeyResult.rawLines);
    }
    // If keyscan returned nothing (host unreachable), we proceed to the
    // probe step which will surface the connectivity error naturally.
  }

  // Step 1: Probe
  emitProgress({ step: "probing", message: msg("vmWizard.mainProbing", { label: host.label }), reachMethod: "ssh" });

  if (wizardCancelled) {
    emitProgress({ step: "error", message: msg("vmWizard.mainWizardCancelled"), reachMethod: "ssh" });
    throw new Error("vmWizard.mainCancelled");
  }

  const probe = await probeVm(host);
  emitProgress({ step: "probing", message: msg("vmWizard.mainProbeComplete"), reachMethod: "ssh", probe });

  if (!probe.reachable || !probe.authOk) {
    emitProgress({
      step: "error",
      message: probe.errorDetail ?? msg("vmWizard.mainCannotReach"),
      reachMethod: "ssh",
      probe,
    });
    throw new Error("vmWizard.mainCannotReach");
  }

  if (!probe.nodeFound) {
    const decision = await askConsent(
      msg("vmWizard.mainConsentNodeNotFound"),
      probe,
    );

    if (decision === "skip") {
      emitProgress({
        step: "error",
        message: msg("vmWizard.mainNodeNotFoundFinal"),
        reachMethod: "ssh",
        probe,
      });
      throw new Error("vmWizard.mainNodeNotFoundFinal");
    }

    emitProgress({ step: "installing", message: msg("vmWizard.mainInstallingMise"), reachMethod: "ssh", probe });

    const miseResult = await installNodeViaMise(host);

    if (!miseResult.success) {
      emitProgress({
        step: "error",
        message: miseResult.errorDetail ?? msg("vmWizard.mainMiseFailed"),
        reachMethod: "ssh",
        probe,
      });
      throw new Error("vmWizard.mainMiseFailed");
    }

    emitProgress({
      step: "probing",
      message: msg("vmWizard.mainNodeInstalledReprobing", { version: miseResult.nodeVersion ?? "" }),
      reachMethod: "ssh",
      probe,
    });

    const reprobe = await probeVm(host);

    if (!reprobe.nodeFound) {
      emitProgress({
        step: "error",
        message: msg("vmWizard.mainMiseNodeStillMissing"),
        reachMethod: "ssh",
        probe: reprobe,
      });
      throw new Error("vmWizard.mainNodeStillNotFoundAfterMise");
    }

    if (reprobe.nodeVersion && reprobe.errorDetail) {
      emitProgress({
        step: "error",
        message: reprobe.errorDetail,
        reachMethod: "ssh",
        probe: reprobe,
      });
      throw new Error("vmWizard.mainNodeStillNotFoundAfterMise");
    }

    probe.nodeFound = true;
    probe.nodeVersion = reprobe.nodeVersion;
    emitProgress({ step: "probing", message: msg("vmWizard.mainProbeComplete"), reachMethod: "ssh", probe: reprobe });
  }

  if (probe.nodeVersion && probe.errorDetail) {
    const decision = await askConsent(
      msg("vmWizard.mainConsentNodeOld", { detail: probe.errorDetail?.key ?? "" }),
      probe,
    );

    if (decision === "skip") {
      emitProgress({
        step: "error",
        message: probe.errorDetail,
        reachMethod: "ssh",
        probe,
      });
      throw new Error("vmWizard.mainConsentNodeOld");
    }

    emitProgress({ step: "installing", message: msg("vmWizard.mainUpgradingViaMise"), reachMethod: "ssh", probe });

    const miseResult = await installNodeViaMise(host);

    if (!miseResult.success) {
      emitProgress({
        step: "error",
        message: miseResult.errorDetail ?? msg("vmWizard.mainMiseUpgradeFailed"),
        reachMethod: "ssh",
        probe,
      });
      throw new Error("vmWizard.mainMiseUpgradeFailed");
    }

    emitProgress({
      step: "probing",
      message: msg("vmWizard.mainNodeInstalledReprobing", { version: miseResult.nodeVersion ?? "" }),
      reachMethod: "ssh",
      probe,
    });

    const reprobe = await probeVm(host);

    if (!reprobe.nodeFound) {
      emitProgress({
        step: "error",
        message: msg("vmWizard.mainMiseUpgradeStillMissing"),
        reachMethod: "ssh",
        probe: reprobe,
      });
      throw new Error("vmWizard.mainNodeStillNotFoundAfterUpgrade");
    }

    if (reprobe.nodeVersion && reprobe.errorDetail) {
      emitProgress({
        step: "error",
        message: reprobe.errorDetail,
        reachMethod: "ssh",
        probe: reprobe,
      });
      throw new Error("vmWizard.mainNodeStillNotFoundAfterUpgrade");
    }

    probe.nodeVersion = reprobe.nodeVersion;
    probe.errorDetail = null;
    emitProgress({ step: "probing", message: msg("vmWizard.mainProbeComplete"), reachMethod: "ssh", probe: reprobe });
  }

  if (probe.loopTaskFound === false) {
    const decision = await askConsent(
      msg("vmWizard.mainConsentLoopTaskNotFound"),
      probe,
      "ssh",
      "loop-task-consent",
    );

    if (decision === "skip") {
      emitProgress({
        step: "error",
        message: msg("vmWizard.mainLoopTaskInstallCancelled"),
        reachMethod: "ssh",
        probe,
      });
      throw new Error("vmWizard.mainLoopTaskInstallCancelled");
    }

    emitProgress({
      step: "installing",
      message: msg("vmWizard.mainInstallingLoopTask"),
      reachMethod: "ssh",
      probe,
    });

    const loopTaskLaunch = await launchOnVm(host, {
      daemonRunning: probe.daemonRunning,
      daemonPort: probe.daemonPort,
      opencodeRunning: probe.opencodeRunning,
      opencodePort: probe.opencodePort,
      installTools: {},
    });

    if (!loopTaskLaunch.started) {
      emitProgress({
        step: "error",
        message: loopTaskLaunch.errorDetail ?? msg("vmWizard.mainFailedToStartServices"),
        reachMethod: "ssh",
        probe,
        launch: loopTaskLaunch,
      });
      throw new Error("vmWizard.mainFailedToStartServices");
    }

    probe.loopTaskFound = true;
    probe.daemonRunning = true;
    probe.daemonPort = loopTaskLaunch.daemonPort;
  }

  // Step 2: Pick services
  if (wizardCancelled) {
    emitProgress({ step: "error", message: msg("vmWizard.mainWizardCancelled"), reachMethod: "ssh" });
    throw new Error("vmWizard.mainCancelled");
  }

  const serviceSelection = await askServiceSelection(probe, agentRuntime);

  // Step 2.5: Runtime provisioning — check and offer to install the chosen runtime
  let runtimeState: RuntimeState = "unknown";

  if (wizardCancelled) {
    emitProgress({ step: "error", message: msg("vmWizard.mainWizardCancelled"), reachMethod: "ssh" });
    throw new Error("vmWizard.mainCancelled");
  }

  {
    const runtimeAdapter = createRuntimeAdapter(agentRuntime);
    emitProgress({ step: "runtime-provision", message: runtimeDetectMessage(agentRuntime, { available: false }), reachMethod: "ssh", probe });

    const detected = runtimeAdapter.detect(probe);

    if (detected.available) {
      runtimeState = "available";
      emitProgress({ step: "runtime-provision", message: runtimeDetectMessage(agentRuntime, detected), reachMethod: "ssh", probe });
    } else {
      // Offer to install the runtime
      emitProgress({
        step: "runtime-consent",
        message: runtimeConsentMessage(agentRuntime),
        reachMethod: "ssh",
        probe,
        consentPrompt: runtimeConsentMessage(agentRuntime),
      });

      let runtimeDecision: "install" | "skip";
      try {
        runtimeDecision = await new Promise<"install" | "skip">((resolve) => {
          runtimeConsentResolver = resolve;
        });
      } finally {
        runtimeConsentResolver = null;
      }

      if (wizardCancelled) {
        emitProgress({ step: "error", message: msg("vmWizard.mainWizardCancelled"), reachMethod: "ssh" });
        throw new Error("vmWizard.mainCancelled");
      }

      if (runtimeDecision === "skip") {
        runtimeState = "unavailable";
      } else {
        // Ensure the chosen runtime is included in the install tools
        const selectedRuntimeToolId = runtimeToolId(agentRuntime);
        serviceSelection.installTools[selectedRuntimeToolId] = true;
      }
    }
  }

  // Step 3: Install / Start
  if (wizardCancelled) {
    emitProgress({ step: "error", message: msg("vmWizard.mainWizardCancelled"), reachMethod: "ssh" });
    throw new Error("vmWizard.mainCancelled");
  }

  emitProgress({ step: "installing", message: msg("vmWizard.mainInstallingServices"), reachMethod: "ssh", probe });

  const launch = await launchOnVm(host, {
    daemonRunning: probe.daemonRunning,
    daemonPort: probe.daemonPort,
    opencodeRunning: probe.opencodeRunning,
    opencodePort: probe.opencodePort,
    installTools: serviceSelection.installTools,
  });

  emitProgress({ step: "installing", message: msg("vmWizard.mainServicesReady"), reachMethod: "ssh", probe, launch });

  if (!launch.started) {
    emitProgress({
      step: "error",
      message: launch.errorDetail ?? msg("vmWizard.mainFailedToStartServices"),
      reachMethod: "ssh",
      probe,
      launch,
    });
    throw new Error("vmWizard.mainFailedToStartServices");
  }

  const daemonPort = launch.daemonPort ?? 8845;
  const opencodePort = launch.opencodePort;

  // Update runtime state based on launch result
  const selectedRuntimeToolId = runtimeToolId(agentRuntime);
  const runtimeStatus = launch.toolStatuses[selectedRuntimeToolId];
  if (runtimeState !== "available" && (runtimeStatus === "installed" || runtimeStatus === "started" || runtimeStatus === "already-running")) {
    runtimeState = "available";
  } else if (runtimeState !== "available" && runtimeStatus === "failed") {
    runtimeState = "unavailable";
  }

  // Direct URL — daemon is reachable on the VM's IP. No tunnel.
  const daemonUrl = `http://${host.hostName}:${daemonPort}`;

  // Step 4: Pair
  if (wizardCancelled) {
    emitProgress({ step: "error", message: msg("vmWizard.mainWizardCancelled"), reachMethod: "ssh" });
    throw new Error("vmWizard.mainCancelled");
  }

  emitProgress({ step: "pairing", message: msg("vmWizard.mainCreatingPairing"), reachMethod: "ssh", probe, launch });

  const remoteCode = await createPairingCodeOnRemote(host, daemonPort);
  const pair: VmWizardPairResult = { paired: false, pairingCode: remoteCode, errorDetail: null };

  let pendingToken: SessionToken | null = null;

  if (remoteCode) {
    pair.pairingCode = remoteCode;
    const exchangeResult = await exchangePairingCode(daemonUrl, remoteCode, "operate");
    if (exchangeResult.ok && exchangeResult.token) {
      pair.paired = true;
      pendingToken = exchangeResult.token;
    } else {
      pair.errorDetail = msg("vmWizard.mainPairingExchangeFailed");
    }
  }
  // remoteCode null = daemon doesn't support pairing yet. Not fatal, env is still accessible.

  if (remoteCode && !pair.paired) {
    // Pairing was attempted but failed, show the failure before continuing.
    emitProgress({ step: "pairing", message: msg("vmWizard.mainPairingFailed"), reachMethod: "ssh", probe, launch, pair });
  } else if (pair.paired) {
    emitProgress({ step: "pairing", message: msg("vmWizard.mainPaired"), reachMethod: "ssh", probe, launch, pair });
  }
  // If no remoteCode, skip pairing progress entirely.

  // Step 4: Save environment (direct URL, daemon is reachable on the VM's IP)
  const env = await addEnvironment(envName, daemonUrl, "ssh", host.label, agentRuntime);
  await persistWizardCredentials(env.id, sshKeyPassphrase, pair.paired ? pendingToken : null, "ssh");
  await setEnvironmentRuntimeState(env.id, runtimeState);
  await autoPromoteFirstEnvIfNeeded();

  if (opencodePort) {
    await setOpenCodeEndpoint(env.id, {
      url: `http://${host.hostName}:${opencodePort}`,
      password: null,
    });
  }

  emitProgress({
    step: "done",
    message: msg("vmWizard.mainEnvReady", { name: envName, url: daemonUrl }),
    reachMethod: "ssh",
    probe,
    launch,
    pair,
  });

  return {
    environmentId: env.id,
    environmentName: envName,
    daemonUrl,
  };
}

/**
 * Local/reachable wizard path — the daemon is already running and reachable
 * at a known URL (e.g. http://localhost:8845). No SSH, no install, no tunnel.
 * Validates reachability before persisting.
 */
async function runLocalWizard(
  name: string,
  directUrl: string | undefined,
  agentRuntime: AgentRuntime,
  sshKeyPassphrase: string | undefined,
): Promise<VmWizardResult> {
  const url = directUrl ? trimTrailingSlash(directUrl.trim()) : "";

  // Validate URL format
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    emitProgress({
      step: "error",
      message: msg("vmWizard.mainInvalidDirectUrl"),
      reachMethod: "local",
      probe: null,
    });
    throw new Error("vmWizard.mainInvalidDirectUrl");
  }

  emitProgress({ step: "probing", message: msg("vmWizard.stepProbing"), reachMethod: "local" });

  // Quick health check: can we reach the daemon?
  const healthResult = await fetchAndUnwrap<{ ok: boolean }>(
    `${url}/api/projects`,
    { timeoutMs: 10_000 },
  );

  if (!healthResult.ok) {
    emitProgress({
      step: "error",
      message: msg("vmWizard.mainDirectUrlUnreachable", { url }),
      reachMethod: "local",
      probe: null,
    });
    throw new Error("vmWizard.mainDirectUrlUnreachable");
  }

  // Duplicate guard: reject if an environment with this URL already exists
  const existingEnvs = getEnvironments();
  const duplicateByUrl = existingEnvs.find((e) =>
    e.endpoints.some((ep) => ep.url === url)
  );
  if (duplicateByUrl) {
    emitProgress({
      step: "error",
      message: msg("vmWizard.mainAlreadyExists", { name: duplicateByUrl.name }),
      reachMethod: "local",
      probe: null,
    });
    throw new Error("vmWizard.mainAlreadyExists");
  }

  // Runtime provisioning — check availability for local/direct environments
  let runtimeState: RuntimeState = "unknown";

  emitProgress({ step: "runtime-provision", message: runtimeDetectMessage(agentRuntime, { available: false }), reachMethod: "local" });

  if (agentRuntime === "opencode") {
    // For OpenCode on local environments, check if the OpenCode server responds.
    // We try the default OpenCode port (13284) on the same host as the daemon.
    try {
      const daemonHost = url.replace(/^https?:\/\//, "").replace(/:\d+.*$/, "");
      const ocResult = await fetchAndUnwrap<{ ok: boolean }>(
        `http://${daemonHost}:13284/api/health`,
        { timeoutMs: 5_000 },
      );
      runtimeState = ocResult.ok ? "available" : "unavailable";
    } catch {
      runtimeState = "unavailable";
    }
  }
  // For Claude Code on local environments, we cannot verify without SSH, so it stays "unknown".

  emitProgress({ step: "runtime-provision", message: runtimeDetectMessage(agentRuntime, { available: runtimeState === "available" }), reachMethod: "local" });

  // Save environment — local/direct, no SSH target
  const env = await addEnvironment(name, url, "direct", undefined, agentRuntime);
  await persistWizardCredentials(env.id, sshKeyPassphrase, null, "local");
  await setEnvironmentRuntimeState(env.id, runtimeState);
  await autoPromoteFirstEnvIfNeeded();

  emitProgress({
    step: "done",
    message: msg("vmWizard.mainEnvReady", { name, url }),
    reachMethod: "local",
  });

  return {
    environmentId: env.id,
    environmentName: name,
    daemonUrl: url,
  };
}
