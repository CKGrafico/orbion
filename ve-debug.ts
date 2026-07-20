import { launchElectronApp } from "./src/visual-evidence/launch/electron-launcher.js";
import { prepareTempDir } from "./src/visual-evidence/launch/deterministic-env.js";
import { resolveConfig, findRepoRoot } from "./src/visual-evidence/config.js";

async function main(): Promise<void> {
  const repoRoot = findRepoRoot();
  const config = resolveConfig();
  const temp = prepareTempDir(repoRoot, "debug-test", config);
  console.log("Launching web mode...");
  const launched = await launchElectronApp(repoRoot, temp, config, { skipBuild: true });
  console.log("Launched. URL:", launched.window.url());
  const body = await launched.window.textContent("body");
  console.log("Body text (first 300):", body?.slice(0, 300));
  const rootHtml = await launched.window.innerHTML("#root");
  console.log("Root innerHTML (first 500):", rootHtml?.slice(0, 500));
  // Capture a screenshot for debugging
  await launched.window.screenshot({ path: ".tmp/visual-evidence/debug-test/screenshot.png" });
  console.log("Screenshot saved.");
  await launched.close();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
