import { execFile } from "node:child_process";
import type { I18nMessage } from "../shared/ipc.js";
import { msg } from "./i18n.js";
import { resolvePlatformCli } from "./platform-cli.js";

// ── CLI input sanitization (issue #191) ──────────────────────────────

/** Label: alphanumeric, underscore, dot, colon, slash, hyphen only. No commas, spaces, or `--` prefix. */
export const LABEL_RE = /^[a-zA-Z0-9_.:/-]+$/;
/** Repo: `owner/repo` where each part is alphanumeric, underscore, dot, or hyphen. */
export const REPO_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
/** Control characters (newlines, null bytes, tabs, etc.) – reject in title/body. */
export const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;

export function validateLabels(labels: string[]): void {
  for (const label of labels) {
    if (!LABEL_RE.test(label)) {
      throw new Error(`Invalid label: "${label}". Labels may only contain letters, digits, _, ., :, /, -`);
    }
    if (label.startsWith("--")) {
      throw new Error(`Invalid label: "${label}". Labels must not start with "--"`);
    }
  }
}

export function validateRepo(repo: string | undefined): void {
  if (!repo) return;
  if (!REPO_RE.test(repo)) {
    throw new Error(`Invalid repo format: "${repo}". Expected "owner/repo"`);
  }
}

export function sanitizeText(value: string): string {
  return value.replace(CONTROL_CHAR_RE, " ").trim();
}

export function validateCliInputs(opts: { title?: string; body?: string; labels?: string[]; repo?: string | undefined }): void {
  if (opts.labels?.length) validateLabels(opts.labels);
  if (opts.repo) validateRepo(opts.repo);
  if (opts.title && CONTROL_CHAR_RE.test(opts.title)) {
    throw new Error("Title contains invalid control characters");
  }
  if (opts.body && CONTROL_CHAR_RE.test(opts.body)) {
    throw new Error("Body contains invalid control characters");
  }
}

// ── ghExec helper ────────────────────────────────────────────────────

export interface GhExecOptions {
  args: string[];
  cli?: "gh" | "az";
  preferredCli?: "gh" | "az" | null;
  i18nPrefix: "issues" | "editIssue" | "labels" | "review";
  maxBuffer?: number;
  /** If true, return error when resolved CLI is not `gh`. */
  requireGh?: boolean;
  /** If provided, validate inputs before executing. */
  validateInputs?: { title?: string; body?: string; labels?: string[]; repo?: string | undefined };
}

export type GhExecResult =
  | { ok: true; stdout: string; stderr: string }
  | { ok: false; error: I18nMessage };

/**
 * Execute a platform CLI command (gh or az) with unified error handling.
 *
 * Resolves the platform CLI, optionally validates inputs, runs execFile,
 * and maps ENOENT / general errors to I18nMessage results.
 */
export function ghExec(options: GhExecOptions): Promise<GhExecResult> {
  const {
    args,
    preferredCli = null,
    i18nPrefix,
    maxBuffer,
    requireGh = false,
    validateInputs,
  } = options;

  return (async (): Promise<GhExecResult> => {
    const cliResolved = await resolvePlatformCli(preferredCli, i18nPrefix);
    if ("error" in cliResolved) {
      return { ok: false, error: cliResolved.error };
    }
    const useCli = cliResolved.cli;

    if (requireGh && useCli !== "gh") {
      return { ok: false, error: msg("labels.ghRequiredForLabels") };
    }

    if (validateInputs) {
      try {
        validateCliInputs(validateInputs);
      } catch (validationErr) {
        return { ok: false, error: msg(`${i18nPrefix}.validationError`, { detail: (validationErr as Error).message }) };
      }
    }

    const execOptions = maxBuffer ? { maxBuffer } : undefined;

    return new Promise<GhExecResult>((resolve) => {
      execFile(useCli, args, execOptions, (err, stdout, stderr) => {
        if (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === "ENOENT") {
            resolve({ ok: false, error: msg(`${i18nPrefix}.noPlatformCli`) });
            return;
          }
          resolve({ ok: false, error: msg(`${i18nPrefix}.cliError`, { detail: stderr || err.message }) });
          return;
        }
        resolve({ ok: true, stdout, stderr });
      });
    });
  })();
}

/**
 * Execute `gh` CLI specifically, with all the standard error mapping.
 * Convenience wrapper around ghExec when you know it must be `gh`.
 */
export function ghExecOnly(
  args: string[],
  i18nPrefix: GhExecOptions["i18nPrefix"],
  opts?: { maxBuffer?: number; repo?: string; validateInputs?: GhExecOptions["validateInputs"] },
): Promise<GhExecResult> {
  return ghExec({
    args,
    i18nPrefix,
    requireGh: true,
    maxBuffer: opts?.maxBuffer,
    validateInputs: opts?.validateInputs,
  });
}
