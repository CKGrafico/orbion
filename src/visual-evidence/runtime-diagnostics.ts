import type { ConsoleMessage, Page } from "playwright";

export interface RuntimeDiagnostics {
  readonly errors: readonly string[];
  readonly dispose: () => void;
}

export function installRuntimeDiagnostics(page: Page): RuntimeDiagnostics {
  const errors: string[] = [];
  const onPageError = (error: Error): void => {
    errors.push(`Page error: ${error.message}`);
  };
  const onConsole = (message: ConsoleMessage): void => {
    if (message.type() === "error") errors.push(`Console error: ${message.text()}`);
  };
  page.on("pageerror", onPageError);
  page.on("console", onConsole);
  return {
    errors,
    dispose: () => {
      page.off("pageerror", onPageError);
      page.off("console", onConsole);
    },
  };
}
