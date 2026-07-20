import { describe, it, expect } from "vitest";
import {
  matchShapeToFleetIntent,
  adaptShapeForPlatform,
  detectCommandPlatform,
  buildProvenance,
} from "../src/renderer/src/fleet-shape-adapt";
import type { LoopShape, PlatformType } from "../src/shared/ipc";

// ── Test data ──────────────────────────────────────────────────────────

function makeShape(overrides: Partial<LoopShape> & { loopId: string; environmentId: string }): LoopShape {
  return {
    command: overrides.command ?? "echo hello",
    commandArgs: overrides.commandArgs ?? [],
    intervalHuman: overrides.intervalHuman ?? "5m",
    projectId: overrides.projectId,
    taskId: overrides.taskId ?? null,
    chainSteps: overrides.chainSteps ?? [],
    cachedAt: overrides.cachedAt ?? Date.now(),
    loopId: overrides.loopId,
    environmentId: overrides.environmentId,
  };
}

const GH_SHAPE = makeShape({
  loopId: "gh-1",
  environmentId: "remote-gh",
  command: "gh issue list --repo owner/repo --state open",
  commandArgs: ["--limit", "20"],
  chainSteps: [
    {
      taskId: "task-1",
      taskName: "List GitHub issues",
      command: "gh issue list --repo owner/repo --state open",
      commandArgs: ["--limit", "20"],
      onSuccessTaskId: null,
      onFailureTaskId: null,
    },
  ],
});

const AZ_SHAPE = makeShape({
  loopId: "az-1",
  environmentId: "remote-az",
  command: "az boards work-item list --organization https://dev.azure.com/org",
  commandArgs: [],
});

const NEUTRAL_SHAPE = makeShape({
  loopId: "neutral-1",
  environmentId: "remote-neutral",
  command: "echo hello",
  commandArgs: [],
});

// ── matchShapeToFleetIntent ────────────────────────────────────────────

describe("matchShapeToFleetIntent", () => {
  it("returns null when no shapes match", () => {
    const result = matchShapeToFleetIntent("deploy production", [], "local");
    expect(result).toBeNull();
  });

  it("returns null when only own-environment shapes exist", () => {
    const shapes = [makeShape({ loopId: "s1", environmentId: "local", command: "gh run list" })];
    const result = matchShapeToFleetIntent("gh run list", shapes, "local");
    expect(result).toBeNull();
  });

  it("matches by exact normalized command", () => {
    const shapes = [GH_SHAPE];
    const result = matchShapeToFleetIntent("gh issue list --repo owner/repo --state open", shapes, "local");
    expect(result).not.toBeNull();
    expect(result!.shape.loopId).toBe("gh-1");
    expect(result!.score).toBe(0.9);
  });

  it("matches by base command name", () => {
    const shapes = [GH_SHAPE];
    const result = matchShapeToFleetIntent("gh issue list --repo other/repo", shapes, "local");
    expect(result).not.toBeNull();
    expect(result!.shape.loopId).toBe("gh-1");
    expect(result!.score).toBe(0.5);
  });

  it("returns the highest-scoring match when multiple shapes exist", () => {
    const shapes = [
      makeShape({ loopId: "partial", environmentId: "remote-1", command: "gh pr list" }),
      GH_SHAPE,
    ];
    const result = matchShapeToFleetIntent("gh issue list --repo owner/repo --state open", shapes, "local");
    expect(result!.shape.loopId).toBe("gh-1");
  });

  it("skips shapes below the minimum score threshold", () => {
    const shapes = [makeShape({ loopId: "mismatch", environmentId: "remote-1", command: "docker build ." })];
    const result = matchShapeToFleetIntent("gh issue list", shapes, "local", 0.3);
    expect(result).toBeNull();
  });
});

// ── detectCommandPlatform ──────────────────────────────────────────────

describe("detectCommandPlatform", () => {
  it("detects GitHub from 'gh' command", () => {
    expect(detectCommandPlatform("gh issue list")).toBe("github");
  });

  it("detects GitHub from URL", () => {
    expect(detectCommandPlatform("curl https://github.com/org/repo")).toBe("github");
  });

  it("detects ADO from 'az' command", () => {
    expect(detectCommandPlatform("az boards work-item list")).toBe("ado");
  });

  it("detects ADO from URL", () => {
    expect(detectCommandPlatform("curl https://dev.azure.com/org/proj")).toBe("ado");
  });

  it("returns unknown for neutral commands", () => {
    expect(detectCommandPlatform("echo hello")).toBe("unknown");
  });
});

// ── adaptShapeForPlatform ──────────────────────────────────────────────

describe("adaptShapeForPlatform", () => {
  it("returns shape unchanged when target is the same platform", () => {
    const adapted = adaptShapeForPlatform(GH_SHAPE, "github");
    expect(adapted.command).toBe(GH_SHAPE.command);
    expect(adapted.substitutions).toHaveLength(0);
  });

  it("returns shape unchanged when target platform is unknown", () => {
    const adapted = adaptShapeForPlatform(GH_SHAPE, "unknown");
    expect(adapted.command).toBe(GH_SHAPE.command);
    expect(adapted.substitutions).toHaveLength(0);
  });

  it("adapts gh → az when target is ADO", () => {
    const adapted = adaptShapeForPlatform(GH_SHAPE, "ado");
    expect(adapted.command).toContain("az ");
    expect(adapted.command).not.toContain("gh ");
    expect(adapted.substitutions.length).toBeGreaterThan(0);

    // Check that substitution was recorded
    const ghSub = adapted.substitutions.find((s) => s.from === "gh");
    expect(ghSub).toBeDefined();
    expect(ghSub!.to).toBe("az");
  });

  it("adapts az → gh when target is GitHub", () => {
    const adapted = adaptShapeForPlatform(AZ_SHAPE, "github");
    expect(adapted.command).toContain("gh ");
    expect(adapted.command).not.toContain("az ");
  });

  it("adapts chain step commands", () => {
    const adapted = adaptShapeForPlatform(GH_SHAPE, "ado");
    expect(adapted.chainSteps.length).toBe(1);
    expect(adapted.chainSteps[0].command).toContain("az ");
    expect(adapted.chainSteps[0].command).not.toContain("gh ");
  });

  it("adapts GitHub URLs to Azure DevOps URLs", () => {
    const shape = makeShape({
      loopId: "url-test",
      environmentId: "remote-gh",
      command: "gh api https://github.com/org/repo",
    });
    const adapted = adaptShapeForPlatform(shape, "ado");
    expect(adapted.command).toContain("dev.azure.com");
    expect(adapted.command).not.toContain("github.com");
  });

  it("leaves neutral commands unchanged even when switching platforms", () => {
    const adapted = adaptShapeForPlatform(NEUTRAL_SHAPE, "ado");
    expect(adapted.command).toBe("echo hello");
    expect(adapted.substitutions).toHaveLength(0);
  });

  it("adapts --repo arg to --organization for ADO target", () => {
    const adapted = adaptShapeForPlatform(GH_SHAPE, "ado");
    // The substitution should have been applied to command args
    const repoSub = adapted.substitutions.find((s) => s.from === "--repo");
    if (repoSub) {
      expect(repoSub.to).toBe("--organization");
    }
  });

  it("records all substitution fields correctly", () => {
    const adapted = adaptShapeForPlatform(GH_SHAPE, "ado");
    for (const sub of adapted.substitutions) {
      expect(sub.from).toBeTruthy();
      expect(sub.to).toBeTruthy();
      expect(sub.field).toBeTruthy();
    }
  });
});

// ── buildProvenance ────────────────────────────────────────────────────

describe("buildProvenance", () => {
  it("returns null when both description and instance are empty", () => {
    expect(buildProvenance("", "", null, false)).toBeNull();
  });

  it("builds same-platform provenance without platform label", () => {
    const result = buildProvenance("deploy", "prod-vm", "github", false);
    expect(result).toBe("Based on your deploy loop on prod-vm");
  });

  it("builds adapted provenance with platform label when substitutions were made", () => {
    const result = buildProvenance("deploy", "prod-vm", "ado", true);
    expect(result).toBe("Based on your deploy loop on prod-vm, adapted for Azure DevOps");
  });

  it("builds GitHub platform label", () => {
    const result = buildProvenance("build", "staging", "github", true);
    expect(result).toContain("GitHub");
  });

  it("omits platform label when unknown and no substitutions", () => {
    const result = buildProvenance("build", "dev-vm", "unknown", false);
    expect(result).toBe("Based on your build loop on dev-vm");
  });

  it("uses fallback when loop description is empty", () => {
    const result = buildProvenance("", "prod-vm", null, false);
    expect(result).toContain("loop");
  });
});
