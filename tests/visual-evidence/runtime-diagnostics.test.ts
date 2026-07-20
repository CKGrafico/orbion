import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { installRuntimeDiagnostics } from "../../src/visual-evidence/runtime-diagnostics.js";

describe("installRuntimeDiagnostics", () => {
  it("collects page and console errors", () => {
    const page = new EventEmitter();
    const diagnostics = installRuntimeDiagnostics(page as never);
    page.emit("pageerror", new Error("render failed"));
    page.emit("console", { type: () => "error", text: () => "request failed" });
    expect(diagnostics.errors).toEqual([
      "Page error: render failed",
      "Console error: request failed",
    ]);
    diagnostics.dispose();
  });
});
