/**
 * FFmpeg detection + invocation wrapper.
 *
 * Pure I/O, no business logic. The caller (gif.ts) uses {@link detectFfmpeg}
 * to decide whether to attempt GIF conversion at all, and {@link runFfmpeg}
 * to execute. Both are safe to mock in tests.
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";

/** Locate ffmpeg on PATH or in common install locations. Returns null if not found. */
export function detectFfmpeg(): string | null {
  // Try `which ffmpeg` / `where ffmpeg`
  try {
    const out = execFileSync(
      process.platform === "win32" ? "where" : "which",
      ["ffmpeg"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    const first = out.split(/\r?\n/)[0];
    if (first) return first;
  } catch {
    // not on PATH
  }
  const common = [
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/opt/homebrew/bin/ffmpeg",
  ];
  for (const p of common) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export interface FfmpegRunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Spawn ffmpeg with the given args. Resolves on exit code 0.
 * Rejects with the stderr tail on non-zero exit.
 */
export function runFfmpeg(args: readonly string[], opts?: {
  timeoutMs?: number;
}): Promise<FfmpegRunResult> {
  const timeoutMs = opts?.timeoutMs ?? 60_000;
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args as string[], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, timeoutMs);

    proc.stdout?.on("data", (c: Buffer) => stdoutChunks.push(c));
    proc.stderr?.on("data", (c: Buffer) => stderrChunks.push(c));

    proc.on("error", (err: Error) => {
      clearTimeout(timer);
      reject(new Error(`ffmpeg spawn failed: ${err.message}`));
    });

    proc.on("close", (code: number | null) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      const exitCode = code ?? -1;
      if (exitCode === 0 && !timedOut) {
        resolve({ code: 0, stdout, stderr });
      } else if (timedOut) {
        reject(new Error(`ffmpeg timed out after ${timeoutMs}ms`));
      } else {
        reject(new Error(`ffmpeg exited with ${exitCode}\n${stderr.slice(-2000)}`));
      }
    });
  });
}
