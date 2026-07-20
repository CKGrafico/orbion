import { chromium } from "playwright";
import { spawn, type ChildProcess } from "node:child_process";

function startDevServer(repoRoot: string, port: number): { process: ChildProcess; url: string } {
  const proc = spawn("pnpm", ["dev:web", "--port", String(port), "--strictPort"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    env: { ...process.env, ORBION_VISUAL_EVIDENCE: "1" },
  });
  proc.stdout?.on("data", (c: Buffer) => process.stdout.write("[DEV] " + c));
  proc.stderr?.on("data", (c: Buffer) => process.stderr.write("[DEV-ERR] " + c));
  return { process: proc, url: `http://localhost:${port}` };
}

async function waitForDevServer(url: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(url);
      if (resp.ok || resp.status === 200) return;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Dev server at ${url} did not respond`);
}

async function main(): Promise<void> {
  const { process: devProc, url } = startDevServer(process.cwd(), 5184);
  await waitForDevServer(url, 30_000);
  console.log("Dev server ready");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on("console", (msg) => console.log("[RENDERER]", msg.type(), msg.text()));
  page.on("pageerror", (err) => console.log("[PAGE ERROR]", err.message));
  await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
  await new Promise((r) => setTimeout(r, 3000));
  const body = await page.textContent("body");
  console.log("Body text:", body?.slice(0, 300));
  await page.screenshot({ path: ".tmp/visual-evidence/debug2.png" });
  await browser.close();
  devProc.kill("SIGTERM");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
