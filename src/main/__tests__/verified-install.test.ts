import { describe, it, expect } from "vitest";
import { NPM_PACKAGES } from "../verified-install";

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
});
