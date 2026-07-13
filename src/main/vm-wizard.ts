import { BrowserWindow } from "electron";
import type { SshHost, VmWizardProgress, VmWizardResult, VmWizardPairResult } from "../shared/ipc.js";
import { listSshHosts, parseTarget } from "./ssh-config.js";
import { probeVm } from "./ssh-probe.js";
import { launchOnVm, createPairingCodeOnRemote, hashForHost } from "./ssh-launch.js";
import { openTunnel, closeTunnel, getTunnelId, findExistingTunnel } from "./ssh-tunnel.js";
import { addEnvironment, addEndpoint, exchangePairingCode, storeSessionToken, setOpenCodeEndpoint } from "./config-store.js";

let wizardCancelled = false;

export function cancelWizard(): void {
  wizardCancelled = true;
}

export function isWizardCancelled(): boolean {
  return wizardCancelled;
}

export function resetWizardState(): void {
  wizardCancelled = false;
}

export { listSshHosts };

function emitProgress(progress: VmWizardProgress): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send("vmWizard:progress", progress);
  }
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
      message: `Invalid target "${target}". Use user@host format or a known SSH alias.`,
      probe: null,
    });
    throw new Error(`Invalid target "${target}"`);
  }

  const envName = name ?? host.hostName ?? host.host;

  // Step 1: Probe
  emitProgress({ step: "probing", message: `Probing ${host.label}…` });

  if (wizardCancelled) {
    emitProgress({ step: "error", message: "Wizard cancelled." });
    throw new Error("Cancelled");
  }

  const probe = await probeVm(host);
  emitProgress({ step: "probing", message: "Probe complete.", probe });

  if (!probe.reachable || !probe.authOk) {
    emitProgress({
      step: "error",
      message: probe.errorDetail ?? "Cannot reach the target VM.",
      probe,
    });
    throw new Error(probe.errorDetail ?? "Cannot reach the target VM.");
  }

  if (!probe.nodeFound) {
    emitProgress({
      step: "error",
      message: "Node.js not found on the VM. Install Node 18+ before running the wizard.",
      probe,
    });
    throw new Error("Node.js not found on the VM.");
  }

  if (probe.nodeVersion && probe.errorDetail) {
    emitProgress({
      step: "error",
      message: probe.errorDetail,
      probe,
    });
    throw new Error(probe.errorDetail);
  }

  // Step 2: Install / Start
  if (wizardCancelled) {
    emitProgress({ step: "error", message: "Wizard cancelled." });
    throw new Error("Cancelled");
  }

  emitProgress({ step: "installing", message: "Installing and starting services…", probe });

  const launch = await launchOnVm(host, {
    daemonRunning: probe.daemonRunning,
    daemonPort: probe.daemonPort,
    opencodeRunning: probe.opencodeRunning,
    opencodePort: probe.opencodePort,
  });

  emitProgress({ step: "installing", message: "Services ready.", probe, launch });

  if (!launch.started) {
    emitProgress({
      step: "error",
      message: launch.errorDetail ?? "Failed to start services on the VM.",
      probe,
      launch,
    });
    throw new Error(launch.errorDetail ?? "Failed to start services on the VM.");
  }

  const daemonPort = launch.daemonPort ?? 8845;
  const opencodePort = launch.opencodePort;

  // Step 3: Forward tunnel
  if (wizardCancelled) {
    emitProgress({ step: "error", message: "Wizard cancelled." });
    throw new Error("Cancelled");
  }

  emitProgress({ step: "forwarding", message: `Opening SSH tunnel to port ${daemonPort}…`, probe, launch });

  const localPort = 18845;
  const tunnelId = getTunnelId(host, daemonPort);
  const existing = findExistingTunnel(host, daemonPort);

  let tunnel;
  if (existing) {
    tunnel = { forwarded: true, localPort: existing.localPort, errorDetail: null };
  } else {
    tunnel = await openTunnel(host, localPort, daemonPort);
  }

  emitProgress({ step: "forwarding", message: "Tunnel open.", probe, launch, tunnel });

  if (!tunnel.forwarded || !tunnel.localPort) {
    emitProgress({
      step: "error",
      message: tunnel.errorDetail ?? "Failed to open SSH tunnel.",
      probe,
      launch,
      tunnel,
    });
    throw new Error(tunnel.errorDetail ?? "Failed to open SSH tunnel.");
  }

  const daemonUrl = `http://127.0.0.1:${tunnel.localPort}`;

  // Step 4: Pair
  if (wizardCancelled) {
    emitProgress({ step: "error", message: "Wizard cancelled." });
    throw new Error("Cancelled");
  }

  emitProgress({ step: "pairing", message: "Creating pairing code…", probe, launch, tunnel });

  const remoteCode = await createPairingCodeOnRemote(host, daemonPort);
  const pair: VmWizardPairResult = { paired: false, pairingCode: remoteCode, errorDetail: null };

  if (remoteCode) {
    pair.pairingCode = remoteCode;
    const exchangeResult = await exchangePairingCode(daemonUrl, remoteCode, "operate");
    if (exchangeResult.ok && exchangeResult.token) {
      pair.paired = true;
    } else {
      pair.errorDetail = exchangeResult.error ?? "Pairing code exchange failed.";
    }
  } else {
    pair.errorDetail = "Could not create pairing code on the remote daemon. The daemon may not support pairing-create yet.";
  }

  emitProgress({ step: "pairing", message: pair.paired ? "Paired!" : (pair.errorDetail ?? "Pairing failed."), probe, launch, tunnel, pair });

  // Step 5: Save environment
  const env = addEnvironment(envName, daemonUrl, "ssh");

  if (pair.paired) {
    // Try to find the env by URL to store the session token
    const envIdByUrl = env.id;
    const exchangeAgain = await exchangePairingCode(daemonUrl, remoteCode ?? "", "operate");
    if (exchangeAgain.ok && exchangeAgain.token) {
      storeSessionToken(envIdByUrl, exchangeAgain.token);
    }
  }

  if (opencodePort) {
    const ocLocalPort = 23284;
    const ocTunnelId = getTunnelId(host, opencodePort);
    const ocExisting = findExistingTunnel(host, opencodePort);

    if (ocExisting) {
      await setOpenCodeEndpoint(env.id, {
        url: `http://127.0.0.1:${ocExisting.localPort}`,
        password: null,
      });
    } else {
      const ocTunnel = await openTunnel(host, ocLocalPort, opencodePort);
      if (ocTunnel.forwarded && ocTunnel.localPort) {
        await setOpenCodeEndpoint(env.id, {
          url: `http://127.0.0.1:${ocTunnel.localPort}`,
          password: null,
        });
      }
    }
  }

  emitProgress({
    step: "done",
    message: `Environment "${envName}" is ready at ${daemonUrl}.`,
    probe,
    launch,
    tunnel,
    pair,
  });

  return {
    environmentId: env.id,
    environmentName: envName,
    daemonUrl,
  };
}
