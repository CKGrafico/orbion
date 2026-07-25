import fs from "node:fs";
import path from "node:path";
import type { VisualEvidenceConfig } from "./config.js";
import type { EvidenceAsset } from "./types.js";
import { evidenceDir } from "./openspec-resolver.js";

const ALLOWED_FILENAMES: ReadonlySet<string> = new Set(["final.webp", "final.png", "flow.gif", "evidence.json"]);
const CHECKPOINT_FILENAME = /^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.(?:webp|png)$/;

function isAllowedFilename(filename: string): boolean {
  return ALLOWED_FILENAMES.has(filename) || CHECKPOINT_FILENAME.test(filename);
}

export function permanentEvidenceDir(repoRoot: string, changeId: string, config: VisualEvidenceConfig): string {
  return evidenceDir(repoRoot, changeId, config.evidenceDirectoryName);
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export interface AssetToWrite {
  readonly filename: string;
  readonly buffer: Buffer;
}

export function writeFinalAssets(
  repoRoot: string,
  changeId: string,
  config: VisualEvidenceConfig,
  assets: readonly AssetToWrite[],
): readonly string[] {
  ensureDir(permanentEvidenceDir(repoRoot, changeId, config));

  const written: string[] = [];
  for (const a of assets) {
    if (!isAllowedFilename(a.filename)) {
      throw new Error(
        `Refusing to write "${a.filename}" into the OpenSpec evidence folder.`,
      );
    }
    const target = path.join(permanentEvidenceDir(repoRoot, changeId, config), a.filename);
    fs.writeFileSync(target, a.buffer);
    written.push(target);
  }
  return written;
}

export function assetRelativePaths(
  repoRoot: string,
  changeId: string,
  config: VisualEvidenceConfig,
  assets: readonly EvidenceAsset[],
): readonly EvidenceAsset[] {
  const dir = permanentEvidenceDir(repoRoot, changeId, config);
  const rel = path.relative(repoRoot, dir);
  return assets.map((a) => ({ ...a, path: `${rel}/${path.basename(a.path)}` }));
}

export function clearEvidenceDir(repoRoot: string, changeId: string, config: VisualEvidenceConfig): void {
  const dir = permanentEvidenceDir(repoRoot, changeId, config);
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    if (isAllowedFilename(entry)) {
      fs.unlinkSync(path.join(dir, entry));
    }
  }
}
