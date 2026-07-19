import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolvePlatformCli, checkPlatformCli } from "../platform-cli";

// Mock child_process.execFile so tests don't need real gh/az binaries
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";

const mockExecFile = vi.mocked(execFile);

/**
 * Configure the mock to simulate `checkPlatformCli()` results.
 *
 * `checkPlatformCli` tries `gh auth status` first; if it gets ENOENT it
 * tries `az account show`. This helper configures mockExecFile to respond
 * based on which command is invoked.
 */
function mockCliResult(result: {
  gh?: { authenticated: boolean; notFound?: boolean };
  az?: { authenticated: boolean; notFound?: boolean };
}) {
  mockExecFile.mockImplementation((cmd: string, _args: string[], optsOrCb: any, cb?: any) => {
    const callback = typeof optsOrCb === "function" ? optsOrCb : cb;

    if (cmd === "gh") {
      if (result.gh?.notFound) {
        const err = new Error("not found") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        callback!(err as any);
      } else if (result.gh?.authenticated) {
        callback!(null, "", "");
      } else {
        // gh found but not authenticated (not ENOENT)
        const err = new Error("auth required") as NodeJS.ErrnoException;
        callback!(err as any, undefined, "not authenticated");
      }
    } else if (cmd === "az") {
      if (result.az?.notFound) {
        const err = new Error("not found") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        callback!(err as any);
      } else if (result.az?.authenticated) {
        callback!(null, "", "");
      } else {
        // az found but not authenticated (not ENOENT)
        const err = new Error("auth required") as NodeJS.ErrnoException;
        callback!(err as any, undefined, "not authenticated");
      }
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── checkPlatformCli ──────────────────────────────────────────────────

describe("checkPlatformCli", () => {
  it("returns gh authenticated when gh is available and authenticated", async () => {
    mockCliResult({ gh: { authenticated: true } });
    const result = await checkPlatformCli();
    expect(result).toEqual({ cli: "gh", authenticated: true });
  });

  it("returns gh not-authenticated when gh exists but is not logged in", async () => {
    mockCliResult({ gh: { authenticated: false } });
    const result = await checkPlatformCli();
    expect(result).toEqual(expect.objectContaining({ cli: "gh", authenticated: false }));
  });

  it("returns az authenticated when gh is missing and az is logged in", async () => {
    mockCliResult({ gh: { notFound: true, authenticated: false }, az: { authenticated: true } });
    const result = await checkPlatformCli();
    expect(result).toEqual({ cli: "az", authenticated: true });
  });

  it("returns az not-authenticated when gh is missing and az is not logged in", async () => {
    mockCliResult({ gh: { notFound: true, authenticated: false }, az: { authenticated: false } });
    const result = await checkPlatformCli();
    expect(result).toEqual(expect.objectContaining({ cli: "az", authenticated: false }));
  });

  it("returns null when neither CLI is installed", async () => {
    mockCliResult({ gh: { notFound: true, authenticated: false }, az: { notFound: true, authenticated: false } });
    const result = await checkPlatformCli();
    expect(result).toBeNull();
  });
});

// ── resolvePlatformCli ────────────────────────────────────────────────

describe("resolvePlatformCli", () => {
  it("resolves to gh when gh is authenticated and no preferredCli", async () => {
    mockCliResult({ gh: { authenticated: true } });
    const result = await resolvePlatformCli(null, "issues");
    expect(result).toEqual({ cli: "gh" });
  });

  it("resolves to az when only az is authenticated", async () => {
    mockCliResult({ gh: { notFound: true, authenticated: false }, az: { authenticated: true } });
    const result = await resolvePlatformCli(null, "issues");
    expect(result).toEqual({ cli: "az" });
  });

  it("returns noPlatformCli error when no CLI is available and no preferredCli", async () => {
    mockCliResult({ gh: { notFound: true, authenticated: false }, az: { notFound: true, authenticated: false } });
    const result = await resolvePlatformCli(null, "issues");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.key).toBe("issues.noPlatformCli");
    }
  });

  it("returns ghNotAuth error when gh exists but is not authenticated (no preferredCli)", async () => {
    mockCliResult({ gh: { authenticated: false } });
    const result = await resolvePlatformCli(null, "issues");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.key).toBe("issues.ghNotAuth");
    }
  });

  it("returns azNotAuth error when only az exists but is not authenticated", async () => {
    mockCliResult({ gh: { notFound: true, authenticated: false }, az: { authenticated: false } });
    const result = await resolvePlatformCli(null, "editIssue");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.key).toBe("editIssue.azNotAuth");
    }
  });

  it("uses preferredCli=gh when gh is available and authenticated", async () => {
    mockCliResult({ gh: { authenticated: true } });
    const result = await resolvePlatformCli("gh", "issues");
    expect(result).toEqual({ cli: "gh" });
  });

  it("uses preferredCli=az when az is available and authenticated", async () => {
    mockCliResult({ gh: { notFound: true, authenticated: false }, az: { authenticated: true } });
    const result = await resolvePlatformCli("az", "issues");
    expect(result).toEqual({ cli: "az" });
  });

  it("falls back to az when preferredCli=gh but gh is not found and az is authenticated", async () => {
    mockCliResult({ gh: { notFound: true, authenticated: false }, az: { authenticated: true } });
    const result = await resolvePlatformCli("gh", "issues");
    expect(result).toEqual({ cli: "az" });
  });

  it("falls back to gh when preferredCli=az but az is not found and gh is authenticated", async () => {
    // When gh is authenticated, checkPlatformCli returns {cli:'gh', authenticated:true}
    // preferredCli=az but cliCheck.cli='gh' and cliCheck.authenticated=true => fallback
    mockCliResult({ gh: { authenticated: true } });
    const result = await resolvePlatformCli("az", "issues");
    expect(result).toEqual({ cli: "gh" });
  });

  it("returns ghNotAuth when preferredCli=gh but gh is not authenticated", async () => {
    mockCliResult({ gh: { authenticated: false } });
    const result = await resolvePlatformCli("gh", "editIssue");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.key).toBe("editIssue.ghNotAuth");
    }
  });

  it("returns ghNotAuth when preferredCli=az but az is not found and only gh (not auth'd) exists", async () => {
    // checkPlatformCli finds gh but it's not authenticated
    mockCliResult({ gh: { authenticated: false } });
    const result = await resolvePlatformCli("az", "issues");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.key).toBe("issues.ghNotAuth");
    }
  });

  it("uses correct i18n prefix for labels errors", async () => {
    mockCliResult({ gh: { notFound: true, authenticated: false }, az: { notFound: true, authenticated: false } });
    const result = await resolvePlatformCli(null, "labels");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.key).toBe("labels.noPlatformCli");
    }
  });

  it("returns noPlatformCli when both CLIs missing and preferredCli is set but not available", async () => {
    mockCliResult({ gh: { notFound: true, authenticated: false }, az: { notFound: true, authenticated: false } });
    const result = await resolvePlatformCli("gh", "issues");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.key).toBe("issues.noPlatformCli");
    }
  });

  it("prefers preferredCli match over fallback when both are authenticated", async () => {
    // In reality checkPlatformCli only returns one CLI (the first it finds),
    // so "both authenticated" means the one checkPlatformCli returns.
    // If checkPlatformCli returns gh and preferredCli=gh, it uses gh.
    mockCliResult({ gh: { authenticated: true } });
    const result = await resolvePlatformCli("gh", "issues");
    expect(result).toEqual({ cli: "gh" });
  });

  it("falls back to whatever is authenticated when preferredCli does not match available CLI", async () => {
    // gh is authenticated but preferredCli=az — should fall back to gh
    mockCliResult({ gh: { authenticated: true } });
    const result = await resolvePlatformCli("az", "issues");
    expect(result).toEqual({ cli: "gh" });
  });
});
