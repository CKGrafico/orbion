/**
 * Locate the active OpenSpec change and read its proposal/tasks/archive context.
 *
 * Active changes live at the top level of `openspec/changes/<id>/`. The
 * `archive/` subfolder holds already-archived changes and is excluded. This
 * mirrors the `openspec-archive-change` skill's `mv changeRoot →
 * archive/YYYY-MM-DD-<name>/` convention, so any `evidence/` subfolder we
 * create inside the active change moves together with the archive.
 */
import fs from "node:fs";
import path from "node:path";
import type { ChangeContext } from "./types.js";

export class OpenSpecResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenSpecResolutionError";
  }
}

export function openspecRoot(repoRoot: string): string {
  return path.join(repoRoot, "openspec");
}

export function changesDir(repoRoot: string): string {
  return path.join(openspecRoot(repoRoot), "changes");
}

export function changeRoot(repoRoot: string, changeId: string): string {
  return path.join(changesDir(repoRoot), changeId);
}

/** List active (non-archived) change IDs from `openspec/changes/`. */
export function listActiveChanges(repoRoot: string): string[] {
  const dir = changesDir(repoRoot);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "archive")
    .map((e) => e.name)
    .sort();
}

/**
 * Resolve the active change directory for a given ID.
 *
 * @throws OpenSpecResolutionError when the id is missing/ambiguous or the
 *   folder does not exist or is already archived.
 */
export function resolveActiveChange(repoRoot: string, changeId?: string): string {
  const active = listActiveChanges(repoRoot);

  if (!changeId) {
    if (active.length === 0) {
      throw new OpenSpecResolutionError(
        "No active OpenSpec changes found under openspec/changes/ (all archived or none exist).",
      );
    }
    if (active.length === 1) return changeRoot(repoRoot, active[0]!);
    throw new OpenSpecResolutionError(
      `Multiple active OpenSpec changes found; specify one with --change:\n${active.map((a) => `  - ${a}`).join("\n")}`,
    );
  }

  if (active.includes(changeId)) return changeRoot(repoRoot, changeId);

  // Maybe it's already archived
  const archived = path.join(changesDir(repoRoot), "archive");
  if (fs.existsSync(archived)) {
    const archivedNames = fs
      .readdirSync(archived, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    const match = archivedNames.find(
      (n) => n === changeId || n.endsWith(`-${changeId}`),
    );
    if (match) {
      throw new OpenSpecResolutionError(
        `Change "${changeId}" is already archived (openspec/changes/archive/${match}). Only active changes accept evidence.`,
      );
    }
  }

  throw new OpenSpecResolutionError(
    `OpenSpec change "${changeId}" not found under openspec/changes/ (top-level only; archive/ excluded).`,
  );
}

// ── Markdown section parsing ───────────────────────────────────────────

function readIfExists(file: string): string | undefined {
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  return undefined;
}

function extractSection(md: string, heading: string): string | null {
  // Find a heading line and capture everything from the NEXT line until the
  // next same-or-higher-level heading, or end of document. We avoid the
  // regex `$` anchor (which matches end-of-line, leaving the capture empty)
  // by scanning line-by-line.
  const lines = md.split("\n");
  const headingRe = new RegExp(`^#{1,6}\\s+${escapeRegex(heading)}\\b\\s*$`, "i");
  const nextHeadingRe = /^#{1,6}\s+/;
  let inSection = false;
  const body: string[] = [];
  for (const line of lines) {
    if (nextHeadingRe.test(line)) {
      if (inSection) break;
      if (headingRe.test(line)) inSection = true;
      continue;
    }
    if (inSection) body.push(line);
  }
  if (!inSection) return null;
  const text = body.join("\n").trim();
  return text.length > 0 ? text : null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseAcceptanceCriteria(proposal: string | undefined, archive: string | undefined): string[] {
  const sources = [proposal, archive].filter(Boolean) as string[];
  for (const md of sources) {
    const section =
      extractSection(md, "Acceptance Criteria") ??
      extractSection(md, "Acceptance criteria") ??
      extractSection(md, "Acceptance criteria mapping");
    if (!section) continue;
    return splitListItems(section).map((l) => l.replace(/^\[[ xX]\]\s*/, "").trim());
  }
  // As a fallback, extract any `- [ ]` / `- [x]` items anywhere in proposal
  if (proposal) {
    const items = proposal
      .split("\n")
      .filter((l) => /^\s*-\s*\[[ xX]\]/.test(l))
      .map((l) => l.replace(/^\s*-\s*\[[ xX]\]\s*/, "").trim());
    if (items.length) return items;
  }
  return [];
}

function splitListItems(block: string): string[] {
  return block
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- ") || l.startsWith("* "))
    .map((l) => l.replace(/^[-*]\s+/, "").trim());
}

function parseAffectedFiles(proposal: string | undefined, archive: string | undefined): string[] {
  const sources = [archive, proposal].filter(Boolean) as string[];
  for (const md of sources) {
    const section =
      extractSection(md, "Affected files") ??
      extractSection(md, "Files Modified") ??
      extractSection(md, "Scope");
    if (!section) continue;
    // Strip trailing descriptions after em-dash (—), en-dash (—), or " -- ":
    // keep only the path token before the separator.
    const items = splitListItems(section)
      .map((l) => {
        // Stop at the first em-dash / en-dash / " -- " / " - "
        const cut = l.replace(/\s+[—–-].*$/, "").replace(/\s+--.*$/, "").trim();
        return cut;
      })
      .map((l) => l.replace(/^`+|`+$/g, "").trim())
      .filter((l) => l.length > 0 && !/^[-—–]$/.test(l));
    if (items.length) return items;
  }
  return [];
}

export function readChangeContext(repoRoot: string, changeId: string): ChangeContext {
  const dir = resolveActiveChange(repoRoot, changeId);
  const proposal = readIfExists(path.join(dir, "proposal.md"));
  const tasks = readIfExists(path.join(dir, "tasks.md"));
  const archive = readIfExists(path.join(dir, "archive.md"));

  if (!proposal && !tasks && !archive) {
    throw new OpenSpecResolutionError(
      `OpenSpec change "${changeId}" has no proposal.md, tasks.md, or archive.md at ${dir}.`,
    );
  }

  return {
    changeId,
    changeDir: dir,
    proposal,
    tasks,
    archive,
    acceptanceCriteria: parseAcceptanceCriteria(proposal, archive),
    affectedFiles: parseAffectedFiles(proposal, archive),
    active: true,
  };
}

/** Compute the path of the evidence folder inside an active change. */
export function evidenceDir(repoRoot: string, changeId: string, evidenceDirectoryName: string): string {
  return path.join(changeRoot(repoRoot, changeId), evidenceDirectoryName);
}
