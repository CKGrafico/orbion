import { beforeEach, describe, expect, it, vi } from "vitest";

const probeMocks = vi.hoisted(() => ({
  execFile: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: probeMocks.execFile,
}));

import { probeVm } from "../src/main/ssh-probe.js";

const sshHost = {
  host: "dev-vm",
  hostName: "10.0.0.8",
  user: "orbion",
  port: 22,
  label: "orbion@dev-vm",
};

interface SshResponse {
  stdout: string;
  stderr?: string;
  code?: number;
}

function mockSshResponses(responses: SshResponse[]): void {
  const queue = [...responses];
  probeMocks.execFile.mockImplementation((...args: unknown[]) => {
    const callback = args[3] as (
      error: NodeJS.ErrnoException | null,
      stdout: string,
      stderr: string,
    ) => void;
    const response = queue.shift();
    if (!response) throw new Error("Unexpected SSH probe command");

    const error = response.code
      ? Object.assign(new Error("SSH command failed"), { code: response.code })
      : null;
    callback(error, response.stdout, response.stderr ?? "");
  });
}

function successfulProbeResponses(nodeVersion: string, loopTaskOutput: string): SshResponse[] {
  return [
    { stdout: `NODE_FOUND|/usr/bin/node|${nodeVersion}\n` },
    { stdout: `${loopTaskOutput}\n` },
    { stdout: "DAEMON_NOT_RUNNING\nOPENCODE_NOT_RUNNING\n" },
    { stdout: "TOOL_MISSING|openCode\nTOOL_MISSING|claude\n" },
  ];
}

describe("SSH loop-task onboarding probe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("detects loop-task from the dedicated remote command probe", async () => {
    mockSshResponses(successfulProbeResponses("v20.0.0", "LOOP_TASK_FOUND"));

    const result = await probeVm(sshHost);

    expect(result).toMatchObject({
      reachable: true,
      authOk: true,
      nodeFound: true,
      nodeVersion: "v20.0.0",
      loopTaskFound: true,
      errorDetail: null,
    });
    expect(probeMocks.execFile).toHaveBeenCalledTimes(4);
    expect(probeMocks.execFile.mock.calls[1]?.[1]).toEqual(
      expect.arrayContaining([expect.stringContaining("command -v loop-task")]),
    );
  });

  it("reports loop-task missing when the command is unavailable", async () => {
    mockSshResponses(successfulProbeResponses("v22.0.0", "LOOP_TASK_NOT_FOUND"));

    await expect(probeVm(sshHost)).resolves.toMatchObject({
      loopTaskFound: false,
      errorDetail: null,
    });
  });

  it("accepts Node 20 at the supported version floor", async () => {
    mockSshResponses(successfulProbeResponses("v20.0.0", "LOOP_TASK_FOUND"));

    await expect(probeVm(sshHost)).resolves.toMatchObject({
      nodeFound: true,
      nodeVersion: "v20.0.0",
      errorDetail: null,
    });
  });

  it("rejects Node versions below 20 with deterministic diagnostics", async () => {
    mockSshResponses(successfulProbeResponses("v19.9.0", "LOOP_TASK_FOUND"));

    await expect(probeVm(sshHost)).resolves.toMatchObject({
      nodeFound: true,
      nodeVersion: "v19.9.0",
      errorDetail: {
        key: "vmWizard.mainNodeTooOld",
        params: { version: "v19.9.0", floor: "20.0.0" },
      },
    });
  });
});
