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
  launchOnVm: vi.fn(),
  listSshHosts: vi.fn(),
  parseTarget: vi.fn(),
  probeVm: vi.fn(),
  progressSend: vi.fn(),
  removeEnvironment: vi.fn(),
  setOpenCodeEndpoint: vi.fn(),
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
}));

vi.mock("../src/main/ssh-config.js", () => ({
  listSshHosts: wizardMocks.listSshHosts,
  parseTarget: wizardMocks.parseTarget,
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

import { respondServiceSelection, runWizard } from "../src/main/vm-wizard.js";

const sshHost = {
  host: "dev-vm",
  hostName: "10.0.0.8",
  user: "orbion",
  port: 22,
  label: "orbion@dev-vm",
};

function probeWith(installedTools: Record<string, boolean>): VmWizardProbeResult {
  return {
    reachable: true,
    authOk: true,
    nodeFound: true,
    nodeVersion: "22.0.0",
    daemonRunning: false,
    daemonPort: null,
    opencodeRunning: false,
    opencodePort: null,
    installedTools,
    errorDetail: null,
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
  });

  it("persists the selected runtime through the local wizard path", async () => {
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
});
