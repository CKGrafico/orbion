import { describe, it, expect } from "vitest";
import {
  normalizeCommand,
  scoreLoopSimilarity,
  computeSimilarLoops,
  type SimilarLoopMatch,
} from "../src/renderer/src/fleet-similarity.js";
import type { LoopWithOrigin, LoopMeta } from "../src/renderer/src/types.js";
import type { ReachabilityState } from "../src/shared/ipc.js";

// ── Test data factories ────────────────────────────────────────────────

const BASE_LOOP: Omit<LoopMeta, "id" | "status" | "command"> = {
  description: undefined,
  commandArgs: [],
  cwd: "/home/user",
  intervalHuman: "5m",
  maxRuns: null,
  runCount: 0,
  skippedCount: 0,
  lastExitCode: null,
  lastRunAt: null,
  nextRunAt: null,
  pid: null,
  projectId: "default",
  runHistory: [],
  createdAt: new Date().toISOString(),
};

const makeLoop = (
  overrides: Partial<LoopMeta> & Pick<LoopMeta, "id" | "status" | "command">,
): LoopMeta => ({ ...BASE_LOOP, ...overrides });

const makeCandidate = (
  overrides: Partial<LoopMeta> & Pick<LoopMeta, "id" | "status" | "command">,
  origin?: Partial<LoopWithOrigin>,
): LoopWithOrigin => ({
  loop: makeLoop(overrides),
  environmentId: "env-1",
  environmentName: "Test VM",
  projectName: "Default",
  ...origin,
});

// i18n key constants matching the source
const REASON_COMMAND = "similarLoops.reason.commandMatch";
const REASON_INTERVAL = "similarLoops.reason.intervalMatch";
const REASON_PROJECT = "similarLoops.reason.projectMatch";

// ── normalizeCommand ────────────────────────────────────────────────────

describe("normalizeCommand", () => {
  it("strips Unix path prefix", () => {
    expect(normalizeCommand("/usr/bin/npm run build")).toBe("npm run build");
  });

  it("strips Windows path prefix", () => {
    expect(normalizeCommand("C:\\Users\\test\\npm.cmd run build")).toBe("npm run build");
  });

  it("strips common executable extensions (.exe, .sh, .bat)", () => {
    expect(normalizeCommand("node.exe")).toBe("node");
    expect(normalizeCommand("test.sh")).toBe("test");
    expect(normalizeCommand("build.bat")).toBe("build");
  });

  it("lowercases the result", () => {
    expect(normalizeCommand("NPM Run Build")).toBe("npm run build");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeCommand("")).toBe("");
  });

  it("handles bare command without path or extension", () => {
    expect(normalizeCommand("docker")).toBe("docker");
  });
});

// ── scoreLoopSimilarity ────────────────────────────────────────────────

describe("scoreLoopSimilarity", () => {
  it("same command, same interval, same project -> score near 1.0 with all 3 match reasons", () => {
    const proposal = { command: "npm run build", interval: "5m", projectName: "Default" };
    const candidate = makeCandidate(
      { id: "c1", status: "running", command: "npm run build", intervalHuman: "5m", projectId: "default" },
    );

    const result = scoreLoopSimilarity(proposal, candidate);

    expect(result.score).toBeGreaterThanOrEqual(0.85);
    expect(result.matchReasons).toContain(REASON_COMMAND);
    expect(result.matchReasons).toContain(REASON_INTERVAL);
    expect(result.matchReasons).toContain(REASON_PROJECT);
  });

  it("same command, different interval -> score ~0.65, only command match reason", () => {
    const proposal = { command: "npm run build", interval: "5m", projectName: "Frontend" };
    const candidate = makeCandidate(
      { id: "c2", status: "running", command: "npm run build", intervalHuman: "10m", projectId: "other" },
    );

    const result = scoreLoopSimilarity(proposal, candidate);

    expect(result.score).toBeGreaterThan(0.4);
    expect(result.score).toBeLessThan(0.8);
    expect(result.matchReasons).toContain(REASON_COMMAND);
    expect(result.matchReasons).not.toContain(REASON_INTERVAL);
  });

  it("different command, same interval -> score ~0.20, only interval match reason", () => {
    const proposal = { command: "npm run build", interval: "5m", projectName: "Frontend" };
    const candidate = makeCandidate(
      { id: "c3", status: "running", command: "docker compose up", intervalHuman: "5m", projectId: "other" },
    );

    const result = scoreLoopSimilarity(proposal, candidate);

    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(0.4);
    expect(result.matchReasons).not.toContain(REASON_COMMAND);
    expect(result.matchReasons).toContain(REASON_INTERVAL);
  });

  it("command prefix match yields partial command score ~0.25", () => {
    const proposal = { command: "npm run build", interval: "5m" };
    const candidate = makeCandidate(
      { id: "c4", status: "running", command: "npm run test", intervalHuman: "10m" },
    );

    const result = scoreLoopSimilarity(proposal, candidate);

    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(0.5);
  });

  it("same project name -> project match contributes 0.15", () => {
    const proposal = { command: "docker compose up", interval: "10m", projectName: "acme-web" };
    const candidate = makeCandidate(
      { id: "c5", status: "running", command: "pytest", intervalHuman: "30m", projectId: "other" },
      { projectName: "acme-web" },
    );

    const result = scoreLoopSimilarity(proposal, candidate);

    expect(result.matchReasons).toContain(REASON_PROJECT);
    expect(result.score).toBeGreaterThanOrEqual(0.1);
    expect(result.score).toBeLessThanOrEqual(0.25);
  });

  it("no similarities -> score = 0, no match reasons", () => {
    const proposal = { command: "npm run build", interval: "5m", projectName: "Frontend" };
    const candidate = makeCandidate(
      { id: "c7", status: "running", command: "cargo test", intervalHuman: "30m", projectId: "backend" },
      { projectName: "Backend" },
    );

    const result = scoreLoopSimilarity(proposal, candidate);

    expect(result.score).toBe(0);
    expect(result.matchReasons).toHaveLength(0);
  });
});

// ── computeSimilarLoops ────────────────────────────────────────────────

describe("computeSimilarLoops", () => {
  const proposal = { command: "npm run build", interval: "5m", projectName: "acme-web" };
  const ownEnvId = "own-env";

  const reachable = (overrides: Record<string, ReachabilityState> = {}): Record<string, ReachabilityState> => ({
    "env-1": "connected",
    "env-2": "connected",
    "env-3": "connected",
    ...overrides,
  });

  it("returns matches from other instances, excluding the own environment", () => {
    const fleetLoops: LoopWithOrigin[] = [
      makeCandidate(
        { id: "l1", status: "running", command: "npm run build", intervalHuman: "5m", projectId: "acme-web" },
        { environmentId: ownEnvId, environmentName: "Own VM", projectName: "acme-web" },
      ),
      makeCandidate(
        { id: "l2", status: "running", command: "npm run build", intervalHuman: "5m", projectId: "acme-web" },
        { environmentId: "env-2", environmentName: "Other VM", projectName: "acme-web" },
      ),
    ];

    const results = computeSimilarLoops({
      proposal,
      fleetLoops,
      reachability: reachable(),
      ownEnvironmentId: ownEnvId,
    });

    expect(results.every((r) => r.environmentId !== ownEnvId)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it("filters out unreachable instances", () => {
    const fleetLoops: LoopWithOrigin[] = [
      makeCandidate(
        { id: "l3", status: "running", command: "npm run build", intervalHuman: "5m", projectId: "acme-web" },
        { environmentId: "env-unreachable", environmentName: "Offline VM", projectName: "acme-web" },
      ),
    ];

    const results = computeSimilarLoops({
      proposal,
      fleetLoops,
      reachability: reachable({ "env-unreachable": "unreachable" }),
      ownEnvironmentId: ownEnvId,
    });

    expect(results).toHaveLength(0);
  });

  it("filters out reconnecting instances", () => {
    const fleetLoops: LoopWithOrigin[] = [
      makeCandidate(
        { id: "l4", status: "running", command: "npm run build", intervalHuman: "5m", projectId: "acme-web" },
        { environmentId: "env-reconnecting", environmentName: "Reconnecting VM", projectName: "acme-web" },
      ),
    ];

    const results = computeSimilarLoops({
      proposal,
      fleetLoops,
      reachability: reachable({ "env-reconnecting": "reconnecting" }),
      ownEnvironmentId: ownEnvId,
    });

    expect(results).toHaveLength(0);
  });

  it("respects maxResults limit (default 3)", () => {
    const fleetLoops: LoopWithOrigin[] = Array.from({ length: 5 }, (_, i) =>
      makeCandidate(
        { id: `l5-${i}`, status: "running", command: "npm run build", intervalHuman: "5m", projectId: "acme-web" },
        { environmentId: `env-${i}`, environmentName: `VM ${i}`, projectName: "acme-web" },
      ),
    );

    const results = computeSimilarLoops({
      proposal,
      fleetLoops,
      reachability: reachable(),
      ownEnvironmentId: ownEnvId,
    });

    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("respects custom maxResults", () => {
    const fleetLoops: LoopWithOrigin[] = Array.from({ length: 5 }, (_, i) =>
      makeCandidate(
        { id: `l6-${i}`, status: "running", command: "npm run build", intervalHuman: "5m", projectId: "acme-web" },
        { environmentId: `env-${i}`, environmentName: `VM ${i}`, projectName: "acme-web" },
      ),
    );

    const results = computeSimilarLoops({
      proposal,
      fleetLoops,
      reachability: reachable(),
      ownEnvironmentId: ownEnvId,
      maxResults: 2,
    });

    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("respects minScore threshold (default 0.3)", () => {
    const fleetLoops: LoopWithOrigin[] = [
      makeCandidate(
        { id: "l7", status: "running", command: "completely different command", intervalHuman: "99h", projectId: "other" },
        { environmentId: "env-1", environmentName: "VM 1", projectName: "unrelated" },
      ),
    ];

    const results = computeSimilarLoops({
      proposal,
      fleetLoops,
      reachability: reachable(),
      ownEnvironmentId: ownEnvId,
    });

    expect(results).toHaveLength(0);
  });

  it("sorts results by score descending", () => {
    const fleetLoops: LoopWithOrigin[] = [
      makeCandidate(
        { id: "l9a", status: "running", command: "pytest", intervalHuman: "5m", projectId: "acme-web" },
        { environmentId: "env-1", environmentName: "VM 1", projectName: "acme-web" },
      ),
      makeCandidate(
        { id: "l9b", status: "running", command: "npm run build", intervalHuman: "5m", projectId: "acme-web" },
        { environmentId: "env-2", environmentName: "VM 2", projectName: "acme-web" },
      ),
    ];

    const results = computeSimilarLoops({
      proposal,
      fleetLoops,
      reachability: reachable(),
      ownEnvironmentId: ownEnvId,
      maxResults: 10,
      minScore: 0,
    });

    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("returns empty array when no matches above threshold", () => {
    const fleetLoops: LoopWithOrigin[] = [
      makeCandidate(
        { id: "l10", status: "running", command: "cargo test", intervalHuman: "30m", projectId: "backend" },
        { environmentId: "env-1", environmentName: "VM 1", projectName: "unrelated" },
      ),
    ];

    const results = computeSimilarLoops({
      proposal,
      fleetLoops,
      reachability: reachable(),
      ownEnvironmentId: ownEnvId,
    });

    expect(results).toHaveLength(0);
  });

  it("returns empty array when fleet loops is empty", () => {
    const results = computeSimilarLoops({
      proposal,
      fleetLoops: [],
      reachability: reachable(),
      ownEnvironmentId: ownEnvId,
    });

    expect(results).toEqual([]);
  });
});
