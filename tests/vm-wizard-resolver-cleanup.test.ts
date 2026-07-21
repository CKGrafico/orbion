import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VmWizardProbeResult } from "../src/shared/ipc.js";

const wizardMocks = vi.hoisted(() => ({
  addEnvironment: vi.fn(),
  appendToKnownHosts: vi.fn(),
  autoPromoteFirstEnvIfNeeded: vi.fn(),
  createPairingCodeOnRemote: vi.fn(),
  exchangePairingCode: vi.fn(),
  fetchAndUnwrap: vi.fn(),
  fetchHostKey: vi.fn(),
  getEnvironments: vi.fn(),
  isHostInKnownHosts: vi.fn(),
  installNodeViaMise: vi.fn(),
  launchOnVm: vi.fn(),
  listSshHosts: vi.fn(),
  parseTarget: vi.fn(),
  probeVm: vi.fn(),
  progressSend: vi.fn(),
  removeEnvironment: vi.fn(),
  setOpenCodeEndpoint: vi.fn(),
  setEnvironmentRuntimeState: vi.fn(),
  storeSessionToken: vi.fn(),
  storeSshKeyPassphrase: vi.fn(),
}));

vi.mock("../src/main/config-store.js", () => ({
  addEnvironment: wizardMocks.addEnvironment,
  autoPromoteFirstEnvIfNeeded: wizardMocks.autoPromoteFirstEnvIfNeeded,
  exchangePairingCode: wizardMocks.exchangePairingCode,
  getEnvironments: wizardMocks.getEnvironments,
  removeEnvironment: wizardMocks.removeEnvironment,
  setOpenCodeEndpoint: wizardMocks.setOpenCodeEndpoint,
  storeSessionToken: wizardMocks.storeSessionToken,
  storeSshKeyPassphrase: wizardMocks.storeSshKeyPassphrase,
  setEnvironmentRuntimeState: wizardMocks.setEnvironmentRuntimeState,
}));

vi.mock("../src/main/ssh-config.js", () => ({
  listSshHosts: wizardMocks.listSshHosts,
  parseTarget: wizardMocks.parseTarget,
  isHostInKnownHosts: wizardMocks.isHostInKnownHosts,
  fetchHostKey: wizardMocks.fetchHostKey,
  appendToKnownHosts: wizardMocks.appendToKnownHosts,
}));

vi.mock("../src/main/ssh-probe.js", () => ({
  installNodeViaMise: wizardMocks.installNodeViaMise,
  probeVm: wizardMocks.probeVm,
}));

vi.mock("../src/main/ssh-launch.js", () => ({
  createPairingCodeOnRemote: wizardMocks.createPairingCodeOnRemote,
  launchOnVm: wizardMocks.launchOnVm,
}));

vi.mock("../src/main/main-window.js", () => ({
  getMainWindow: () => ({ webContents: { send: wizardMocks.progressSend } }),
}));

vi.mock("../src/main/i18n.js", () => ({
  msg: (key: string, params?: Record<string, string | number>) => ({ key, params }),
}));

vi.mock("../src/main/http-utils.js", () => ({
  fetchAndUnwrap: wizardMocks.fetchAndUnwrap,
}));

vi.mock("../src/main/runtime-adapter.js", () => ({
  createRuntimeAdapter: () => ({
    detect: () => ({ available: true }),
  }),
  runtimeDetectMessage: () => ({ key: "runtime.detect" }),
  runtimeConsentMessage: () => ({ key: "runtime.consent" }),
}));

import {
  respondConsent,
  respondServiceSelection,
  respondRuntimeConsent,
  respondHostKey,
  runWizard,
  resetWizardState,
} from "../src/main/vm-wizard.js";

const sshHost = {
  host: "dev-vm",
  hostName: "10.0.0.8",
  user: "orbion",
  port: 22,
  label: "orbion@dev-vm",
};

function probeWith(
  installedTools: Record<string, boolean>,
  overrides: Partial<VmWizardProbeResult> = {},
): VmWizardProbeResult {
  return {
    reachable: true,
    authOk: true,
    nodeFound: true,
    nodeVersion: "22.0.0",
    loopTaskFound: true,
    daemonRunning: false,
    daemonPort: null,
    opencodeRunning: false,
    opencodePort: null,
    installedTools,
    errorDetail: null,
    ...overrides,
  };
}

function progressStepCount(step: string): number {
  const calls: readonly unknown[][] = wizardMocks.progressSend.mock.calls;
  let count = 0;
  for (const call of calls) {
    const progress = call[1];
    if (typeof progress === "object" && progress !== null && "step" in progress && (progress as { step: string }).step === step) {
      count++;
    }
  }
  return count;
}

function waitForProgressStep(step: string, minCount: number, { fromIndex = 0 }: { fromIndex?: number } = {}): Promise<void> {
  return vi.waitFor(() => {
    const calls: readonly unknown[][] = wizardMocks.progressSend.mock.calls;
    let count = 0;
    for (let i = fromIndex; i < calls.length; i++) {
      const progress = calls[i][1];
      if (typeof progress === "object" && progress !== null && "step" in progress && (progress as { step: string }).step === step) {
        count++;
      }
    }
    expect(count).toBeGreaterThanOrEqual(minCount);
  });
}

function setupFullSuccessMocks(): void {
  wizardMocks.probeVm.mockResolvedValue(probeWith({ openCode: true }));
  wizardMocks.launchOnVm.mockResolvedValue({
    started: true,
    daemonPort: 8845,
    opencodePort: null,
    errorDetail: null,
    logTail: null,
    loopTaskStatus: "started" as const,
    toolStatuses: {},
  });
  wizardMocks.createPairingCodeOnRemote.mockResolvedValue(null);
  wizardMocks.addEnvironment.mockResolvedValue({
    id: "created-env",
    name: "Created",
    agentRuntime: "opencode",
    endpoints: [],
    activeEndpointId: null,
  });
  wizardMocks.autoPromoteFirstEnvIfNeeded.mockResolvedValue(undefined);
  wizardMocks.storeSessionToken.mockResolvedValue(true);
  wizardMocks.storeSshKeyPassphrase.mockResolvedValue(true);
  wizardMocks.setOpenCodeEndpoint.mockResolvedValue({ ok: true });
  wizardMocks.setEnvironmentRuntimeState.mockResolvedValue(undefined);
  wizardMocks.removeEnvironment.mockResolvedValue(undefined);
}

describe("Wizard resolver cleanup on mid-step errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWizardState();
    wizardMocks.getEnvironments.mockReturnValue([]);
    wizardMocks.parseTarget.mockReturnValue(sshHost);
    wizardMocks.isHostInKnownHosts.mockReturnValue(true);
  });

  it("consentResolver is null after askConsent throws (node not found, skip)", async () => {
    wizardMocks.probeVm.mockResolvedValue(probeWith({}, { nodeFound: false }));

    const result = runWizard({
      target: sshHost.label,
      reachMethod: "ssh",
      agentRuntime: "opencode",
    });

    await waitForProgressStep("consent", 1);
    respondConsent("skip");

    await expect(result).rejects.toThrow("vmWizard.mainNodeNotFoundFinal");
    expect(() => respondConsent("install")).not.toThrow();
  });

  it("consentResolver is null after wizard completes normally", async () => {
    setupFullSuccessMocks();

    const result = runWizard({
      target: sshHost.label,
      reachMethod: "ssh",
      agentRuntime: "opencode",
    });

    await waitForProgressStep("pick-services", 1);
    respondServiceSelection({ installTools: {} });

    await expect(result).resolves.toBeDefined();
    expect(() => respondConsent("install")).not.toThrow();
  });

  it("serviceSelectionResolver is null after wizard throws post-selection", async () => {
    wizardMocks.probeVm.mockResolvedValue(probeWith({ openCode: true }));
    wizardMocks.launchOnVm.mockResolvedValue({
      started: false,
      daemonPort: null,
      opencodePort: null,
      errorDetail: { key: "vmWizard.mainFailedToStartServices" },
      logTail: "error",
      loopTaskStatus: "failed" as const,
      toolStatuses: {},
    });
    wizardMocks.addEnvironment.mockResolvedValue({
      id: "created-env",
      name: "Created",
      agentRuntime: "opencode",
      endpoints: [],
      activeEndpointId: null,
    });
    wizardMocks.autoPromoteFirstEnvIfNeeded.mockResolvedValue(undefined);
    wizardMocks.storeSessionToken.mockResolvedValue(true);
    wizardMocks.storeSshKeyPassphrase.mockResolvedValue(true);
    wizardMocks.setEnvironmentRuntimeState.mockResolvedValue(undefined);
    wizardMocks.removeEnvironment.mockResolvedValue(undefined);

    const result = runWizard({
      target: sshHost.label,
      reachMethod: "ssh",
      agentRuntime: "opencode",
    });

    await waitForProgressStep("pick-services", 1);
    respondServiceSelection({ installTools: {} });

    await expect(result).rejects.toThrow("vmWizard.mainFailedToStartServices");
    expect(() => respondServiceSelection({ installTools: {} })).not.toThrow();
  });

  it("hostKeyResolver is null after host key rejection", async () => {
    wizardMocks.isHostInKnownHosts.mockReturnValue(false);
    wizardMocks.fetchHostKey.mockResolvedValue({
      fingerprint: "SHA256:abc",
      rawLines: "dev-vm ssh-ed25519 AAAA",
    });

    const result = runWizard({
      target: sshHost.label,
      reachMethod: "ssh",
      agentRuntime: "opencode",
    });

    await waitForProgressStep("host-key-verify", 1);
    respondHostKey(false);

    await expect(result).rejects.toThrow("vmWizard.mainHostKeyRejected");
    expect(() => respondHostKey(true)).not.toThrow();
  });

  it("runtimeConsentResolver is null after skip resolves", async () => {
    setupFullSuccessMocks();

    const result = runWizard({
      target: sshHost.label,
      reachMethod: "ssh",
      agentRuntime: "opencode",
    });

    // With runtime adapter returning available: true, we skip runtime-consent
    // and go straight to pick-services. Test that after full completion,
    // runtimeConsentResolver is null.
    await waitForProgressStep("pick-services", 1);
    respondServiceSelection({ installTools: {} });

    await expect(result).resolves.toBeDefined();
    expect(() => respondRuntimeConsent("install")).not.toThrow();
  });

  it("wizard retry after mid-step exception works without deadlock", async () => {
    setupFullSuccessMocks();

    // First attempt: launch fails
    wizardMocks.probeVm
      .mockResolvedValueOnce(probeWith({ openCode: true }))
      .mockResolvedValueOnce(probeWith({ openCode: true }));
    wizardMocks.launchOnVm
      .mockResolvedValueOnce({
        started: false,
        daemonPort: null,
        opencodePort: null,
        errorDetail: { key: "vmWizard.mainFailedToStartServices" },
        logTail: "error",
        loopTaskStatus: "failed" as const,
        toolStatuses: {},
      })
      .mockResolvedValueOnce({
        started: true,
        daemonPort: 8845,
        opencodePort: null,
        errorDetail: null,
        logTail: null,
        loopTaskStatus: "started" as const,
        toolStatuses: {},
      });

    const firstRun = runWizard({
      target: sshHost.label,
      reachMethod: "ssh",
      agentRuntime: "opencode",
    });

    await waitForProgressStep("pick-services", 1);
    respondServiceSelection({ installTools: {} });

    await expect(firstRun).rejects.toThrow("vmWizard.mainFailedToStartServices");

    // serviceSelectionResolver must be null — calling respond again is a no-op
    expect(() => respondServiceSelection({ installTools: {} })).not.toThrow();

    // Second run: track progress from after the first run's events
    const fromIndex = wizardMocks.progressSend.mock.calls.length;

    const secondRun = runWizard({
      target: sshHost.label,
      reachMethod: "ssh",
      agentRuntime: "opencode",
    });

    await waitForProgressStep("pick-services", 1, { fromIndex });
    respondServiceSelection({ installTools: {} });

    await expect(secondRun).resolves.toMatchObject({ environmentId: "created-env" });
  });
});
