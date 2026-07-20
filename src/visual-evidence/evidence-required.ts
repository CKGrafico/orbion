/**
 * Decide whether a change requires visual evidence.
 *
 * Pure function over {@link ChangeContext} + optional changed-files hint.
 *
 * Require when the change affects user-visible renderer/layout/styling/
 * navigation/forms/interactions/states/window behavior.
 *
 * Skip when the change is docs-only, internal refactor with no visible
 * behavior, dependency-only, test-only, logging-only, or main/backend with
 * no user-visible component.
 */
import type { ChangeContext } from "./types.js";

export interface EvidenceDecision {
  readonly required: boolean;
  readonly reason: string;
}

// ── File pattern signals ───────────────────────────────────────────────

/** Paths under these indicate user-visible UI */
const RENDERER_UI_PATTERNS: readonly RegExp[] = [
  /src\/renderer\//i,
  /src\/renderer\//,
  /components\//i,
  /features\//i,
  /layout/i,
  /theme\.css$/,
  /\.css$/i,
  /\.tsx$/i,
  /i18n\//i,
  /ColdOpen/i,
  /Empty.*[Ss]tate/i,
  /Modal/i,
  /Dialog/i,
  /Form/i,
  /Sidebar/i,
];

/** Patterns that, when ALL files match, indicate no visible change */
const NON_VISUAL_PATTERNS: readonly RegExp[] = [
  /\.md$/i,
  /src\/main\//, // Electron main process (backend) — unless paired with UI
  /src\/shared\/ipc\.ts$/,
  /http-utils/i,
  /sse-parser/i,
  /credential-vault/i,
  /config-store/i,
  /transcript-store/i,
  /tunnel/i,
  /ssh-/i,
  /vm-wizard/i,
  /connection-supervisor/i,
  /reachability-tracker/i,
  /opencode-client/i,
  /agent-client/i,
  /platform-classifier/i,
  /outake/i,
  /\.test\.ts$/i,
  /tests\//i,
  /package\.json$/i,
  /pnpm-lock\.yaml$/i,
  /\.gitignore$/,
  /ARCHITECTURE\.md$/i,
  /DESIGN\.md$/i,
  /README\.md$/i,
  /AGENTS\.md$/i,
  /openspec\//i,
];

const SKIP_KEYWORDS: readonly RegExp[] = [
  /\brefactor\b/i,
  /\binternal\b/i,
  /\blogging\b/i,
  /\bdependency\b/i,
  /\bdeps?\b/i,
  /\bbump\b/i,
];

const REQUIRE_KEYWORDS: readonly RegExp[] = [
  /\bUI\b/i,
  /\brenderer\b/i,
  /\bcomponent\b/i,
  /\blayout\b/i,
  /\bstyling\b/i,
  /\bcss\b/i,
  /\bnavigation\b/i,
  /\bdialog\b/i,
  /\bform\b/i,
  /\binteraction\b/i,
  /\bempty state\b/i,
  /\berror state\b/i,
  /\bsuccess state\b/i,
  /\bloading state\b/i,
  /\bwindow\b/i,
  /\bvisible\b/i,
];

function matchesAny(p: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((re) => re.test(p));
}

function allMatchNonVisual(files: readonly string[]): boolean {
  if (files.length === 0) return false;
  return files.every((f) => matchesAny(f, NON_VISUAL_PATTERNS));
}

function anyMatchesUi(files: readonly string[]): boolean {
  return files.some((f) => matchesAny(f, RENDERER_UI_PATTERNS));
}

export function decideEvidenceRequired(ctx: ChangeContext): EvidenceDecision {
  const files =
    ctx.affectedFiles.length > 0
      ? ctx.affectedFiles
      : [];

  // 1. If changed files list is empty, fall back to proposal text heuristics
  if (files.length === 0) {
    const proposal = ctx.proposal ?? ctx.archive ?? "";
    if (proposal.trim().length === 0) {
      return {
        required: false,
        reason: "No changed files or proposal text available to assess visual impact.",
      };
    }
    // Skip keywords take precedence: if a proposal explicitly describes an
    // internal refactor / dependency update / logging change, evidence is
    // not required even if the word "visible" appears later in the text.
    if (SKIP_KEYWORDS.some((re) => re.test(proposal))) {
      return {
        required: false,
        reason:
          "Proposal describes an internal refactor, dependency update, or logging change with no user-visible behavior.",
      };
    }
    if (REQUIRE_KEYWORDS.some((re) => re.test(proposal))) {
      return {
        required: true,
        reason:
          "Proposal indicates user-visible UI, styling, or interaction change.",
      };
    }
    return {
      required: false,
      reason:
        "No user-visible UI signals detected in the proposal and no changed files available.",
    };
  }

  // 2. Check changed files
  if (anyMatchesUi(files)) {
    return {
      required: true,
      reason:
        "Changed files include renderer components, styling, or UI-related paths.",
    };
  }

  if (allMatchNonVisual(files)) {
    // Construct a readable reason
    const kinds: string[] = [];
    if (files.every((f) => /\.md$/i.test(f))) kinds.push("documentation");
    if (files.every((f) => /tests?\//i.test(f) || /\.test\.ts$/i.test(f)))
      kinds.push("tests");
    if (files.every((f) => /src\/main\//i.test(f))) kinds.push("main process");
    if (files.every((f) => /package\.json$/i.test(f) || /pnpm-lock\.yaml$/i.test(f)))
      kinds.push("dependencies");

    const kindText = kinds.length > 0 ? kinds.join(", ") : "internal-only";
    return {
      required: false,
      reason: `The change only modifies ${kindText} and has no user-visible behavior.`,
    };
  }

  // 3. Mixed / unknown — default to required to be safe
  return {
    required: true,
    reason:
      "Changed files include non-standard paths that may affect user-visible behavior; evidence required to be safe.",
  };
}
