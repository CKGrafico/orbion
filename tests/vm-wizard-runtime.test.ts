import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRuntime, VmWizardProgress, VmWizardProbeResult } from "../src/shared/ipc.js";

const wizardMocks = vi.hoisted(() => ({
  addEnvironment: vi.fn(),
  autoPromoteFirstEnvIfNeeded: vi.fn(),
  createPairingCodeOnRemote: vi.fn(),
  exchangePairingCode: vi.fn(),
  fetchAndUnwrap: vi.fn(),
  getEnvironments: vi.fn(),
  installNodeViaMise: vi.fn(),
  isHostInKnownHosts: vi.fn(),
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

import { respondConsent, respondServiceSelection, runWizard } from "../src/main/vm-wizard.js";

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

function emittedProgress(step: VmWizardProgress["step"]): VmWizardProgress | undefined {
  const calls: readonly unknown[][] = wizardMocks.progressSend.mock.calls;
  for (const call of calls) {
    const progress = call[1];
    if (typeof progress === "object" && progress !== null && "step" in progress && progress.step === step) {
      return progress as VmWizardProgress;
    }
  }
  return undefined;
}

function progressSteps(): VmWizardProgress["step"][] {
  return wizardMocks.progressSend.mock.calls.flatMap((call) => {
    const progress = call[1];
    return typeof progress === "object" && progress !== null && "step" in progress
      ? [(progress as VmWizardProgress).step]
      : [];
  });
}

async function expectSshRuntimePersistence(
  runtime: AgentRuntime,
  selectedTool: "openCode" | "claude",
  unselectedTool: "openCode" | "claude",
): Promise<void> {
  wizardMocks.probeVm.mockResolvedValue(probeWith({
    [selectedTool]: false,
    [unselectedTool]: false,
  }));

  const result = runWizard({
    target: sshHost.label,
    name: "Remote runtime",
    reachMethod: "ssh",
    agentRuntime: runtime,
  });

  await vi.waitFor(() => expect(emittedProgress("pick-services")).toBeDefined());
  const defaults = emittedProgress("pick-services")?.serviceSelection?.installTools;
  expect(defaults?.[selectedTool]).toBe(true);
  expect(defaults?.[unselectedTool]).toBe(false);

  respondServiceSelection({ installTools: { [selectedTool]: false, [unselectedTool]: false } });
  await result;

  expect(wizardMocks.launchOnVm).toHaveBeenCalledWith(
    sshHost,
    expect.objectContaining({
      installTools: expect.objectContaining({
        [selectedTool]: true,
        [unselectedTool]: false,
      }),
    }),
  );
  expect(wizardMocks.addEnvironment).toHaveBeenCalledWith(
    "Remote runtime",
    "http://10.0.0.8:8845",
    "ssh",
    sshHost.label,
    runtime,
  );
  expect(wizardMocks.fetchAndUnwrap).not.toHaveBeenCalled();
}

describe("VM wizard runtime behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wizardMocks.getEnvironments.mockReturnValue([]);
    wizardMocks.fetchAndUnwrap.mockResolvedValue({ ok: true, status: 200, data: { ok: true } });
    wizardMocks.parseTarget.mockReturnValue(sshHost);
    wizardMocks.probeVm.mockResolvedValue(probeWith({}));
    wizardMocks.launchOnVm.mockResolvedValue({
      started: true,
      daemonPort: 8845,
      opencodePort: null,
      errorDetail: null,
      logTail: null,
      loopTaskStatus: "started",
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
    wizardMocks.removeEnvironment.mockResolvedValue(undefined);
    wizardMocks.isHostInKnownHosts.mockReturnValue(true);
    wizardMocks.setEnvironmentRuntimeState.mockResolvedValue(undefined);
  });

  it("never probes or launches through the local wizard path", async () => {
    await runWizard({
      target: "",
      name: "Local Claude",
      reachMethod: "local",
      directUrl: "http://localhost:8845/",
      agentRuntime: "claude",
    });

    expect(wizardMocks.fetchAndUnwrap).toHaveBeenCalledWith(
      "http://localhost:8845/api/projects",
      { timeoutMs: 10_000 },
    );
    expect(wizardMocks.addEnvironment).toHaveBeenCalledWith(
      "Local Claude",
      "http://localhost:8845",
      "direct",
      undefined,
      "claude",
    );
    expect(wizardMocks.probeVm).not.toHaveBeenCalled();
    expect(wizardMocks.launchOnVm).not.toHaveBeenCalled();
  });

  it("defaults missing OpenCode to installation and persists it over SSH", async () => {
    await expectSshRuntimePersistence("opencode", "openCode", "claude");
  });

  it("defaults missing Claude to installation and persists it over SSH", async () => {
    await expectSshRuntimePersistence("claude", "claude", "openCode");
  });

  it("asks for dedicated loop-task consent only after SSH reachability and supported Node are established", async () => {
    const probe = probeWith({ openCode: true }, { loopTaskFound: false });
    wizardMocks.probeVm.mockResolvedValue(probe);

    const result = runWizard({
      target: sshHost.label,
      name: "Missing loop-task",
      reachMethod: "ssh",
      agentRuntime: "opencode",
    });

    await vi.waitFor(() => expect(emittedProgress("loop-task-consent")).toBeDefined());

    const consent = emittedProgress("loop-task-consent");
    expect(consent?.consentPrompt?.key).toBe("vmWizard.mainConsentLoopTaskNotFound");
    expect(consent?.probe).toMatchObject({
      reachable: true,
      authOk: true,
      nodeFound: true,
      nodeVersion: "22.0.0",
      loopTaskFound: false,
    });
    expect(progressSteps()).toEqual(["probing", "probing", "loop-task-consent"]);
    expect(emittedProgress("consent")).toBeUndefined();
    expect(wizardMocks.launchOnVm).not.toHaveBeenCalled();

    respondConsent("skip");
    await expect(result).rejects.toThrow("vmWizard.mainLoopTaskInstallCancelled");
  });

  it("installs missing loop-task without optional tools and continues onboarding", async () => {
    wizardMocks.probeVm.mockResolvedValue(probeWith({ openCode: true }, { loopTaskFound: false }));

    const result = runWizard({
      target: sshHost.label,
      name: "Installed loop-task",
      reachMethod: "ssh",
      agentRuntime: "opencode",
    });

    await vi.waitFor(() => expect(emittedProgress("loop-task-consent")).toBeDefined());
    respondConsent("install");
    await vi.waitFor(() => expect(emittedProgress("pick-services")).toBeDefined());

    expect(wizardMocks.launchOnVm).toHaveBeenNthCalledWith(1, sshHost, {
      daemonRunning: false,
      daemonPort: null,
      opencodeRunning: false,
      opencodePort: null,
      installTools: {},
    });

    respondServiceSelection({ installTools: {} });
    await expect(result).resolves.toMatchObject({ environmentId: "created-env" });
    expect(wizardMocks.launchOnVm).toHaveBeenCalledTimes(2);
    expect(wizardMocks.addEnvironment).toHaveBeenCalledWith(
      "Installed loop-task",
      "http://10.0.0.8:8845",
      "ssh",
      sshHost.label,
      "opencode",
    );
  });

  it("does not add an environment when loop-task installation is skipped", async () => {
    wizardMocks.probeVm.mockResolvedValue(probeWith({}, { loopTaskFound: false }));

    const result = runWizard({
      target: sshHost.label,
      reachMethod: "ssh",
      agentRuntime: "opencode",
    });

    await vi.waitFor(() => expect(emittedProgress("loop-task-consent")).toBeDefined());
    respondConsent("skip");

    await expect(result).rejects.toThrow("vmWizard.mainLoopTaskInstallCancelled");
    expect(wizardMocks.launchOnVm).not.toHaveBeenCalled();
    expect(wizardMocks.addEnvironment).not.toHaveBeenCalled();
  });

  it("exposes install diagnostics and remains ready for a new wizard attempt", async () => {
    const failedLaunch = {
      started: false,
      daemonPort: null,
      opencodePort: null,
      errorDetail: { key: "vmWizard.mainFailedToStartServices" },
      logTail: "npm ERR! package installation failed",
      loopTaskStatus: "failed" as const,
      toolStatuses: {},
    };
    wizardMocks.probeVm
      .mockResolvedValueOnce(probeWith({}, { loopTaskFound: false }))
      .mockResolvedValueOnce(probeWith({ openCode: true }));
    wizardMocks.launchOnVm.mockResolvedValueOnce(failedLaunch);

    const failedAttempt = runWizard({
      target: sshHost.label,
      reachMethod: "ssh",
      agentRuntime: "opencode",
    });
    await vi.waitFor(() => expect(emittedProgress("loop-task-consent")).toBeDefined());
    respondConsent("install");

    await expect(failedAttempt).rejects.toThrow("vmWizard.mainFailedToStartServices");
    expect(emittedProgress("error")).toMatchObject({
      step: "error",
      launch: { logTail: "npm ERR! package installation failed" },
    });

    const retry = runWizard({
      target: sshHost.label,
      reachMethod: "ssh",
      agentRuntime: "opencode",
    });
    await vi.waitFor(() => expect(progressSteps().filter((step) => step === "pick-services")).toHaveLength(1));
    respondServiceSelection({ installTools: {} });
    await expect(retry).resolves.toMatchObject({ environmentId: "created-env" });
  });

  it("skips loop-task consent when the command is already present", async () => {
    wizardMocks.probeVm.mockResolvedValue(probeWith({ openCode: true }, { loopTaskFound: true }));

    const result = runWizard({
      target: sshHost.label,
      reachMethod: "ssh",
      agentRuntime: "opencode",
    });

    await vi.waitFor(() => expect(emittedProgress("pick-services")).toBeDefined());
    expect(emittedProgress("loop-task-consent")).toBeUndefined();
    expect(wizardMocks.launchOnVm).not.toHaveBeenCalled();

    respondServiceSelection({ installTools: {} });
    await expect(result).resolves.toMatchObject({ environmentId: "created-env" });
  });
});
