import { BrowserWindow } from "electron";
import type { SshHost, VmWizardProgress, VmWizardResult, VmWizardPairResult, VmWizardProbeResult, VmWizardServiceSelection, I18nMessage } from "../shared/ipc.js";
import { listSshHosts, parseTarget } from "./ssh-config.js";
import { probeVm, installNodeViaMise } from "./ssh-probe.js";
import { launchOnVm, createPairingCodeOnRemote } from "./ssh-launch.js";
import { getEnvironments, addEnvironment, exchangePairingCode, storeSessionToken, setOpenCodeEndpoint, autoPromoteFirstEnvIfNeeded } from "./config-store.js";
import { msg } from "./i18n.js";

let wizardCancelled = false;
let consentResolver: ((decision: "install" | "skip") => void) | null = null;
let serviceSelectionResolver: ((selection: VmWizardServiceSelection) => void) | null = null;

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

export { listSshHosts };

function emitProgress(progress: VmWizardProgress): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send("vmWizard:progress", progress);
  }
}

async function askServiceSelection(probe: VmWizardProbeResult): Promise<VmWizardServiceSelection> {
  // loop-task is mandatory (always installed). Defaults: install if not already detected.
  const defaultSelection: VmWizardServiceSelection = {
    installOpenCode: !probe.opencodeRunning,
    installGh: !probe.ghInstalled,
    installAzDo: !probe.azDoInstalled,
    installJira: !probe.jiraInstalled,
    installGitlab: !probe.gitlabInstalled,
    installDocker: !probe.dockerInstalled,
    installTerraform: !probe.terraformInstalled,
    installTailscale: !probe.tailscaleInstalled,
    installClaudeCli: !probe.claudeInstalled,
    installJq: !probe.jqInstalled,
    installRipgrep: !probe.ripgrepInstalled,
  };
  emitProgress({
    step: "pick-services",
    message: msg("vmWizard.stepPickServices"),
    probe,
    serviceSelection: defaultSelection,
  });

  const selection = await new Promise<VmWizardServiceSelection>((resolve) => {
    serviceSelectionResolver = resolve;
  });

  if (wizardCancelled) throw new Error("vmWizard.mainCancelled");
  return selection;
}

async function askConsent(
  prompt: I18nMessage,
  probe: VmWizardProbeResult,
): Promise<"install" | "skip"> {
  emitProgress({
    step: "consent",
    message: prompt,
    probe,
    consentPrompt: prompt,
  });

  const decision = await new Promise<"install" | "skip">((resolve) => {
    consentResolver = resolve;
  });

  if (wizardCancelled) {
    throw new Error("vmWizard.mainCancelled");
  }

  return decision;
}

export async function runWizard(target: string, name?: string): Promise<VmWizardResult> {
  resetWizardState();

  let host: SshHost | null = parseTarget(target);
  if (!host) {
    const knownHosts = listSshHosts();
    host = knownHosts.find((h) => h.host === target || h.label === target) ?? null;
  }

  if (!host) {
    emitProgress({
      step: "error",
      message: msg("vmWizard.mainInvalidTarget", { target }),
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
      probe: null,
    });
    throw new Error("vmWizard.mainAlreadyExists");
  }

  // Step 1: Probe
  emitProgress({ step: "probing", message: msg("vmWizard.mainProbing", { label: host.label }) });

  if (wizardCancelled) {
    emitProgress({ step: "error", message: msg("vmWizard.mainWizardCancelled") });
    throw new Error("vmWizard.mainCancelled");
  }

  const probe = await probeVm(host);
  emitProgress({ step: "probing", message: msg("vmWizard.mainProbeComplete"), probe });

  if (!probe.reachable || !probe.authOk) {
    emitProgress({
      step: "error",
      message: probe.errorDetail ?? msg("vmWizard.mainCannotReach"),
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
        probe,
      });
      throw new Error("vmWizard.mainNodeNotFoundFinal");
    }

    emitProgress({ step: "installing", message: msg("vmWizard.mainInstallingMise"), probe });

    const miseResult = await installNodeViaMise(host);

    if (!miseResult.success) {
      emitProgress({
        step: "error",
        message: miseResult.errorDetail ?? msg("vmWizard.mainMiseFailed"),
        probe,
      });
      throw new Error("vmWizard.mainMiseFailed");
    }

    emitProgress({
      step: "probing",
      message: msg("vmWizard.mainNodeInstalledReprobing", { version: miseResult.nodeVersion ?? "" }),
      probe,
    });

    const reprobe = await probeVm(host);

    if (!reprobe.nodeFound) {
      emitProgress({
        step: "error",
        message: msg("vmWizard.mainMiseNodeStillMissing"),
        probe: reprobe,
      });
      throw new Error("vmWizard.mainNodeStillNotFoundAfterMise");
    }

    if (reprobe.nodeVersion && reprobe.errorDetail) {
      emitProgress({
        step: "error",
        message: reprobe.errorDetail,
        probe: reprobe,
      });
      throw new Error("vmWizard.mainNodeStillNotFoundAfterMise");
    }

    probe.nodeFound = true;
    probe.nodeVersion = reprobe.nodeVersion;
    emitProgress({ step: "probing", message: msg("vmWizard.mainProbeComplete"), probe: reprobe });
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
        probe,
      });
      throw new Error("vmWizard.mainConsentNodeOld");
    }

    emitProgress({ step: "installing", message: msg("vmWizard.mainUpgradingViaMise"), probe });

    const miseResult = await installNodeViaMise(host);

    if (!miseResult.success) {
      emitProgress({
        step: "error",
        message: miseResult.errorDetail ?? msg("vmWizard.mainMiseUpgradeFailed"),
        probe,
      });
      throw new Error("vmWizard.mainMiseUpgradeFailed");
    }

    emitProgress({
      step: "probing",
      message: msg("vmWizard.mainNodeInstalledReprobing", { version: miseResult.nodeVersion ?? "" }),
      probe,
    });

    const reprobe = await probeVm(host);

    if (!reprobe.nodeFound) {
      emitProgress({
        step: "error",
        message: msg("vmWizard.mainMiseUpgradeStillMissing"),
        probe: reprobe,
      });
      throw new Error("vmWizard.mainNodeStillNotFoundAfterUpgrade");
    }

    if (reprobe.nodeVersion && reprobe.errorDetail) {
      emitProgress({
        step: "error",
        message: reprobe.errorDetail,
        probe: reprobe,
      });
      throw new Error("vmWizard.mainNodeStillNotFoundAfterUpgrade");
    }

    probe.nodeVersion = reprobe.nodeVersion;
    probe.errorDetail = null;
    emitProgress({ step: "probing", message: msg("vmWizard.mainProbeComplete"), probe: reprobe });
  }

  // Step 2: Pick services
  if (wizardCancelled) {
    emitProgress({ step: "error", message: msg("vmWizard.mainWizardCancelled") });
    throw new Error("vmWizard.mainCancelled");
  }

  const serviceSelection = await askServiceSelection(probe);

  // Step 3: Install / Start
  if (wizardCancelled) {
    emitProgress({ step: "error", message: msg("vmWizard.mainWizardCancelled") });
    throw new Error("vmWizard.mainCancelled");
  }

  emitProgress({ step: "installing", message: msg("vmWizard.mainInstallingServices"), probe });

  const launch = await launchOnVm(host, {
    daemonRunning: probe.daemonRunning,
    daemonPort: probe.daemonPort,
    opencodeRunning: probe.opencodeRunning,
    opencodePort: probe.opencodePort,
    installOpenCode: serviceSelection.installOpenCode,
    installGh: serviceSelection.installGh,
    installAzDo: serviceSelection.installAzDo,
    installJira: serviceSelection.installJira,
    installGitlab: serviceSelection.installGitlab,
    installDocker: serviceSelection.installDocker,
    installTerraform: serviceSelection.installTerraform,
    installTailscale: serviceSelection.installTailscale,
    installClaudeCli: serviceSelection.installClaudeCli,
    installJq: serviceSelection.installJq,
    installRipgrep: serviceSelection.installRipgrep,
  });

  emitProgress({ step: "installing", message: msg("vmWizard.mainServicesReady"), probe, launch });

  if (!launch.started) {
    emitProgress({
      step: "error",
      message: launch.errorDetail ?? msg("vmWizard.mainFailedToStartServices"),
      probe,
      launch,
    });
    throw new Error("vmWizard.mainFailedToStartServices");
  }

  const daemonPort = launch.daemonPort ?? 8845;
  const opencodePort = launch.opencodePort;

  // Direct URL — daemon is reachable on the VM's IP. No tunnel.
  const daemonUrl = `http://${host.hostName}:${daemonPort}`;

  // Step 4: Pair
  if (wizardCancelled) {
    emitProgress({ step: "error", message: msg("vmWizard.mainWizardCancelled") });
    throw new Error("vmWizard.mainCancelled");
  }

  emitProgress({ step: "pairing", message: msg("vmWizard.mainCreatingPairing"), probe, launch });

  const remoteCode = await createPairingCodeOnRemote(host, daemonPort);
  const pair: VmWizardPairResult = { paired: false, pairingCode: remoteCode, errorDetail: null };

  if (remoteCode) {
    pair.pairingCode = remoteCode;
    const exchangeResult = await exchangePairingCode(daemonUrl, remoteCode, "operate");
    if (exchangeResult.ok && exchangeResult.token) {
      pair.paired = true;
    } else {
      pair.errorDetail = msg("vmWizard.mainPairingExchangeFailed");
    }
  }
  // remoteCode null = daemon doesn't support pairing yet. Not fatal, env is still accessible.

  if (remoteCode && !pair.paired) {
    // Pairing was attempted but failed, show the failure before continuing.
    emitProgress({ step: "pairing", message: msg("vmWizard.mainPairingFailed"), probe, launch, pair });
  } else if (pair.paired) {
    emitProgress({ step: "pairing", message: msg("vmWizard.mainPaired"), probe, launch, pair });
  }
  // If no remoteCode, skip pairing progress entirely.

  // Step 4: Save environment (direct URL, daemon is reachable on the VM's IP)
  const env = await addEnvironment(envName, daemonUrl, "direct", host.label);
  await autoPromoteFirstEnvIfNeeded();

  if (pair.paired) {
    const envIdByUrl = env.id;
    const exchangeAgain = await exchangePairingCode(daemonUrl, remoteCode ?? "", "operate");
    if (exchangeAgain.ok && exchangeAgain.token) {
      await storeSessionToken(envIdByUrl, exchangeAgain.token);
    }
  }

  if (opencodePort) {
    await setOpenCodeEndpoint(env.id, {
      url: `http://${host.hostName}:${opencodePort}`,
      password: null,
    });
  }

  emitProgress({
    step: "done",
    message: msg("vmWizard.mainEnvReady", { name: envName, url: daemonUrl }),
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
