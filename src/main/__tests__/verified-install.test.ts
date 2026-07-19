import { describe, it, expect } from "vitest";
import { NPM_PACKAGES, validateNpmIdentifier, pinnedNpmInstall } from "../verified-install";

describe("NPM_PACKAGES", () => {
  it("has no entry with version 'latest'", () => {
    for (const [key, entry] of Object.entries(NPM_PACKAGES)) {
      expect(entry.version, `NPM_PACKAGES.${key}.version must not be "latest"`).not.toBe("latest");
    }
  });

  it("every entry has a non-empty version string", () => {
    for (const [key, entry] of Object.entries(NPM_PACKAGES)) {
      expect(entry.version.length, `NPM_PACKAGES.${key}.version must be non-empty`).toBeGreaterThan(0);
    }
  });

  it("every entry passes shell-safety allowlist validation", () => {
    // If any entry has shell-unsafe characters, validateNpmPackages() would
    // have thrown at module-load time.  This test is a belt-and-suspenders
    // check that the allowlist does not reject any current entries.
    for (const [key, entry] of Object.entries(NPM_PACKAGES)) {
      expect(
        () => validateNpmIdentifier(entry.pkg, entry.version, `NPM_PACKAGES.${key}`),
        `NPM_PACKAGES.${key} should pass allowlist validation`,
      ).not.toThrow();
    }
  });
});

describe("validateNpmIdentifier", () => {
  describe("package name validation", () => {
    it("accepts valid unscoped package names", () => {
      expect(() => validateNpmIdentifier("loop-task", "1.0.0")).not.toThrow();
      expect(() => validateNpmIdentifier("opencode", "1.0.0")).not.toThrow();
      expect(() => validateNpmIdentifier("a", "1.0.0")).not.toThrow();
      expect(() => validateNpmIdentifier("my-package-123", "1.0.0")).not.toThrow();
    });

    it("accepts valid scoped package names", () => {
      expect(() => validateNpmIdentifier("@anthropic-ai/claude-code", "1.0.0")).not.toThrow();
      expect(() => validateNpmIdentifier("@atlassian/acli", "1.0.0")).not.toThrow();
      expect(() => validateNpmIdentifier("@gitlab-org/cli", "1.0.0")).not.toThrow();
    });

    it("rejects package names with shell metacharacters", () => {
      const malicious = [
        "foo;rm -rf /",
        "foo'bar",
        'foo"bar',
        "foo`whoami`",
        "foo$(whoami)",
        "foo|bar",
        "foo&bar",
        "foo>bar",
        "foo<bar",
        "foo{bar}",
        "foo(bar)",
      ];
      for (const pkg of malicious) {
        expect(() => validateNpmIdentifier(pkg, "1.0.0"), `${pkg} should be rejected`).toThrow();
      }
    });

    it("rejects empty package names", () => {
      expect(() => validateNpmIdentifier("", "1.0.0")).toThrow();
    });

    it("rejects package names starting with hyphen", () => {
      expect(() => validateNpmIdentifier("-foo", "1.0.0")).toThrow();
    });

    it("rejects package names with uppercase letters", () => {
      expect(() => validateNpmIdentifier("Foo", "1.0.0")).toThrow();
    });

    it("rejects package names with underscores", () => {
      expect(() => validateNpmIdentifier("foo_bar", "1.0.0")).toThrow();
    });
  });

  describe("version validation", () => {
    it("accepts valid semver versions", () => {
      expect(() => validateNpmIdentifier("foo", "2.2.2")).not.toThrow();
      expect(() => validateNpmIdentifier("foo", "0.0.0")).not.toThrow();
      expect(() => validateNpmIdentifier("foo", "1.0.0")).not.toThrow();
    });

    it("accepts semver with prerelease tag", () => {
      expect(() => validateNpmIdentifier("foo", "1.0.0-beta.1")).not.toThrow();
      expect(() => validateNpmIdentifier("foo", "2.0.0-alpha")).not.toThrow();
    });

    it('rejects "latest"', () => {
      expect(() => validateNpmIdentifier("foo", "latest")).toThrow();
    });

    it("rejects versions with shell injection payloads", () => {
      const payloads = [
        "0.0.0'; rm -rf /; echo ts",
        "1.0.0\"; whoami",
        "0.0.0$(whoami)",
        "0.0.0`whoami`",
        "0.0.0|rm -rf /",
        "0.0.0&malicious",
        "0.0.0 > /etc/passwd",
        "0.0.0\nrm -rf /",
      ];
      for (const version of payloads) {
        expect(() => validateNpmIdentifier("foo", version), `version="${version}" should be rejected`).toThrow();
      }
    });

    it("rejects incomplete semver (missing patch)", () => {
      expect(() => validateNpmIdentifier("foo", "1.0")).toThrow();
    });

    it("rejects incomplete semver (missing minor and patch)", () => {
      expect(() => validateNpmIdentifier("foo", "1")).toThrow();
    });

    it("rejects empty version", () => {
      expect(() => validateNpmIdentifier("foo", "")).toThrow();
    });

    it("rejects version with caret or tilde ranges", () => {
      expect(() => validateNpmIdentifier("foo", "^1.0.0")).toThrow();
      expect(() => validateNpmIdentifier("foo", "~1.0.0")).toThrow();
    });
  });
});

describe("pinnedNpmInstall", () => {
  it("returns a valid npm install command for loopTask", () => {
    expect(pinnedNpmInstall("loopTask")).toBe("npm install -g loop-task@2.2.2");
  });

  it("returns a valid npm install command for claude", () => {
    expect(pinnedNpmInstall("claude")).toBe("npm install -g @anthropic-ai/claude-code@2.1.212");
  });

  it("returns a valid npm install command for all defined packages", () => {
    for (const key of Object.keys(NPM_PACKAGES) as (keyof typeof NPM_PACKAGES)[]) {
      const result = pinnedNpmInstall(key);
      expect(result).toMatch(/^npm install -g .+@.+/);
    }
  });
});
