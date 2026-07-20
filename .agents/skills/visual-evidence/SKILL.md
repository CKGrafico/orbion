---
name: visual-evidence
description: Automated visual evidence for OpenSpec changes in the Orbion Electron app. Use when a change affects user-visible UI/interaction and needs screenshot/GIF evidence stored inside the OpenSpec change folder for a pull request. The skill decides whether evidence is required, launches the Electron app deterministically under Playwright, runs the scenario with assertions, captures + optimizes screenshots and optional GIFs, refuses oversized assets, and writes evidence/ (final.webp, flow.gif, evidence.json) into the active OpenSpec change so it moves together with the change on archive.
license: MIT
metadata:
  author: orbion
  version: "1.0"
---

# Visual Evidence

## Purpose

Generate **automated, OpenSpec-anchored visual evidence** for a pull request.

The skill takes a change-id or input context, locates the corresponding active
OpenSpec change, decides whether the change is user-visible (and so needs
evidence), runs a deterministic Playwright scenario against the real Electron
app, captures a screenshot (and optionally a GIF), performs assertions proving
the expected behavior works, enforces strict size limits, and stores the
**final optimized assets** in the `evidence/` subfolder of the OpenSpec change.

When the change is archived, the evidence folder moves together with the rest
of the change — there is no separate copy step. The external Loop Engineering
workflow consumes the emitted `prMarkdown` and `evidence.json` when it builds
or updates the pull request.

## When to use this skill

Load this skill when:

- An autonomous Loop Engineering workflow has finished implementing and
  validating a change, and is about to create/update the pull request.
- You need meaningful visual proof that the implemented behavior works.
- You want the evidence associated with the **OpenSpec change id**, primarily —
  not the PR number.

## When NOT to use this skill

Do not use when:

- You are capture/screenshot gestures for an ad-hoc manual review — that's the
  browser-automation skill.
- The change is purely internal (docs, refactor, deps) and the decision rule
  below indicates `required: false`. The skill itself skips in that case; you
  should not force it.
- You want to PR-screen a dev build for copy edits. Run it when behavior is the
  subject of the proof.

## How it finds the OpenSpec change

Active changes live at `openspec/changes/<change-id>/` (top-level only; the
`archive/` subfolder is excluded). The resolver:

1. Returns `openspec/changes/<change-id>/` when the id is passed explicitly.
2. If no id is provided, lists active changes and errors when there are zero
   or more than one (so the caller must disambiguate).
3. Reports an explicit error if the change is **already archived** — evidence
   can only be produced for active changes.

Once resolved, the skill reads `proposal.md`, `tasks.md`, and `archive.md`
(when present) into a `ChangeContext`: acceptance criteria, affected files,
proposal body. This feeds the decision rule and the scenario deriver.

## Inputs

The CLI accepts two forms:

```
pnpm visual-evidence --change <change-id>
pnpm visual-evidence --input <path-to-json>
```

The JSON input file has this shape (all fields optional except `changeId`):

```jsonc
{
  "changeId": "gh-142-bulk-relabel",
  "issue": {
    "number": 142,
    "title": "Bulk relabel as a sentence",
    "description": "Users should be able to relabel the current issue stack using a sentence.",
    "acceptanceCriteria": [
      "The user can list a group of issues",
      "The user can enter 'mark these as to-refine'",
      "A confirmation appears containing every affected issue",
      "The result reports success or failure for each issue"
    ]
  },
  "changedFiles": [
    "src/renderer/src/components/InfraChatPanel.tsx",
    "src/main/index.ts"
  ],
  "scenario": { "title": "...", "steps": ["..."] },
  "preferredEvidenceType": "auto",
  "expectedStartingState": "cold-open",
  "prNumber": 142,
  "branchName": "feature/gh-142-bulk-relabel",
  "commitSha": "abc1234..."
}
```

When `--change` and `--input` are both supplied, `--change` overrides the
`changeId` field of the JSON. When neither is supplied, exit code 3 is
returned.

The orchestrator tries to derive `changeId`, `acceptanceCriteria`, and
`affectedFiles` from the OpenSpec change files when they are not present in
the JSON input — duplication is not required.

## Outputs

The skill writes the following into the OpenSpec change folder:

```
openspec/changes/<change-id>/
  proposal.md            (pre-existing, untouched)
  tasks.md               (pre-existing, untouched)
  archive.md             (pre-existing, untouched)
  evidence/
    final.webp           (or final.png when transparency required)
    flow.gif             (only when interaction is meaningful; omitted otherwise)
    evidence.json        (manifest)
```

The CLI also prints the `prMarkdown` fragment to stdout so the Loop
Engineering workflow can capture it.

## Decision rules

Evidence is **required** when changed files include renderer components,
styling, navigation, dialogs, forms, interactions, loading/empty/error/success
states, or user-visible Electron window behavior.

Evidence is **skipped** when the change is docs-only, an internal refactor
with no visible behavior, dependency-only, test-only, logging-only, or
main/backend-only with no user-visible component.

On `skipped` the skill returns immediately with `status: "skipped"` and no
assets — exit code 0.

When the decision is uncertain (mixed paths), the skill defaults to
`required` to be safe.

## Scenario generation

The deriver uses this priority order:

1. Explicit `scenario` field in the input
2. Acceptance criteria from the proposal
3. OpenSpec proposal body
4. OpenSpec tasks file
5. Issue description
6. Changed UI files
7. Existing application tests and behavior

When none of these produce a meaningful scenario, the run returns
`status: "blocked"` rather than fabricating an interaction.

Concrete Playwright runners are registered per change-id in
`src/visual-evidence/scenario-registry.ts`. A textual scenario alone is not
enough — that produces a `blocked` result. Add a runner for the change-id
when implementing a new feature; the registry is the only place that knows
selectors.

## Screenshot rules

- Static screenshot only when the final visual state proves the acceptance
  criteria and the interaction itself is not important.
- One optimized final-state screenshot (`final.webp` or `final.png`).
- Prefer WebP for photographic / complex UIs.
- Use optimized PNG when transparency, pixel-perfect rendering, or
  compatibility requires it.
- Strip metadata.
- Preserve enough quality for UI text to remain legible.
- No device-pixel-ratio 2x scaling unless necessary.

## GIF rules

Generate a GIF **only when** the value of the feature is demonstrated through
a short interaction (opening, creating, navigating, filtering, transitioning).
GIFs should be concise.

The skill applies an optimization ladder (two-pass palette workflow via
ffmpeg) and enforces the configured byte limit. If the GIF cannot fit
within `gif.maxBytes`, the skill **drops the GIF** and keeps the screenshot
alone — it never commits an oversized GIF merely because generation
succeeded.

## Compression rules

The final evidence is aggressively but sensibly compressed. Default thresholds
below; configurable via env vars (`ORBION_VISUAL_EVIDENCE_*`) or
`.orbion/visual-evidence.json`.

```jsonc
{
  "window": { "width": 1280, "height": 720 },
  "screenshot": {
    "preferredFormat": "webp",
    "quality": 82,
    "maxWidth": 1280,
    "targetBytes": 153600,
    "maxBytes": 307200
  },
  "gif": {
    "enabled": true,
    "maxWidth": 960,
    "fps": 10,
    "targetBytes": 1048576,
    "maxBytes": 2097152,
    "maxDurationSeconds": 10
  },
  "temporaryDirectory": ".tmp/visual-evidence",
  "evidenceDirectoryName": "evidence"
}
```

The skill iteratively reduces dimensions and quality until the asset is under
`targetBytes`, then under `maxBytes`, with a readability floor (width ≥ 400,
quality ≥ 40). When the floor is reached, the asset is committed at its
smallest readable form.

## Size limits

The limits are pure functions in `src/visual-evidence/size-limits.ts`. Each
asset is checked against `maxBytes`. Oversized GIFs are dropped and the
screenshot alone is promoted. Final asset bytes are reported in the manifest.

## Validation behavior

The scenario runner performs Playwright assertions proving the expected state
was reached (visible text, dialog open, list item present, button enabled,
navigation target, etc.). Only after assertions pass is the result
`status: "passed"`.

Assertions use accessible selectors (`getByRole`, `getByText`,
`getByLabel`) and Playwright auto-waiting. Fixed sleeps are not used. Test
IDs are added only when accessible selectors are not reliable.

## Failure behavior

On scenario failure:

- A failure screenshot is captured to `.tmp/visual-evidence/<change-id>/failure.png`.
- The raw webm and the Playwright trace are preserved.
- The result is `status: "failed"` with `failedStep` + `error` +
  `temporaryArtifacts` paths.
- **Nothing** is copied into the permanent OpenSpec `evidence/` folder.
- The skill does not claim that visual evidence passed.
- The CLI exits with code 1.

## Privacy and sensitive data rules

- No real credentials. The Electron app launches with a fresh temp
  user-data directory — no personal state, no saved instances.
- No production services are contacted. Use the mock-mode adapter or
  fixture seeds.
- No secrets in screenshots.
- No personal local state is captured.
- `images` allowed in CSP remain `self data:` only.

## Temporary and permanent artifact paths

Temporary:

- `.tmp/visual-evidence/<change-id>/failure.png`
- `.tmp/visual-evidence/<change-id>/video.webm`
- `.tmp/visual-evidence/<change-id>/trace.zip`
- `.tmp/visual-evidence/<change-id>/frames/`
- `.tmp/visual-evidence/<change-id>/logs/`
- `.tmp/visual-evidence/<change-id>/electron-userdata/`

These are gitignored (`.tmp/` is in `.gitignore`) and never committed.

Permanent (inside the OpenSpec change):

- `openspec/changes/<change-id>/evidence/final.webp` or `final.png`
- `openspec/changes/<change-id>/evidence/flow.gif`
- `openspec/changes/<change-id>/evidence/evidence.json`

Nothing else is permitted in that folder (the store module enforces an
allow-list: `final.webp`, `final.png`, `flow.gif`, `evidence.json`).

## Example invocations

```bash
# By change id (most common)
pnpm visual-evidence --change gh-142-bulk-relabel

# From a prepared context JSON
pnpm visual-evidence --input .orbion/context/gh-142-bulk-relabel.json

# Skip the pnpm build step when out/ is already populated
ORBION_VISUAL_EVIDENCE_SKIP_BUILD=1 pnpm visual-evidence --change gh-142-bulk-relabel

# Linux CI: virtual display required
xvfb-run -a pnpm visual-evidence --change gh-142-bulk-relabel
```

## Example outputs

### Passed

```json
{
  "version": 1,
  "changeId": "gh-142-bulk-relabel",
  "required": true,
  "status": "passed",
  "scenario": {
    "title": "Bulk relabel issues using a sentence",
    "steps": [
      "Open the InfraChatPanel",
      "List issues labeled 'to-implement'",
      "Enter 'mark these as to-refine'",
      "Confirm the confirmation card names every affected issue",
      "Apply and verify per-item results"
    ]
  },
  "assertions": [
    { "description": "A confirmation card is shown asking for approval", "status": "passed" },
    { "description": "Each affected issue is listed by number in the confirmation", "status": "passed" },
    { "description": "The intended label change ('to-refine') is visible", "status": "passed" },
    { "description": "A result for each affected issue is shown", "status": "passed" },
    { "description": "The bulk relabel completed successfully for at least one issue", "status": "passed" }
  ],
  "assets": [
    { "type": "screenshot", "path": "openspec/changes/gh-142-bulk-relabel/evidence/final.webp", "caption": "Bulk relabel issues using a sentence", "width": 1280, "height": 720, "bytes": 126481, "format": "webp" },
    { "type": "gif", "path": "openspec/changes/gh-142-bulk-relabel/evidence/flow.gif", "caption": "Bulk relabel issues using a sentence", "width": 960, "height": 540, "fps": 10, "durationSeconds": 5.2, "bytes": 893421, "format": "gif" }
  ],
  "prMarkdown": "## Visual Evidence\n..."
}
```

### Skipped

```json
{
  "version": 1,
  "changeId": "gh-142-internal-refactor",
  "required": false,
  "status": "skipped",
  "reason": "The change only modifies internal logging and has no user-visible behavior.",
  "assets": [],
  "prMarkdown": ""
}
```

### Failed

```json
{
  "version": 1,
  "changeId": "gh-142-bulk-relabel",
  "required": true,
  "status": "failed",
  "failedStep": "run",
  "error": "Expected per-item result markers (✓ or ✗) to be visible after applying",
  "temporaryArtifacts": {
    "screenshot": ".tmp/visual-evidence/gh-142-bulk-relabel/failure.png",
    "video": ".tmp/visual-evidence/gh-142-bulk-relabel/video.webm",
    "trace": ".tmp/visual-evidence/gh-142-bulk-relabel/trace.zip"
  },
  "assets": [],
  "prMarkdown": ""
}
```

## How another agent should consume prMarkdown

The `prMarkdown` field is a ready-to-paste Markdown fragment. The external
Loop Engineering workflow should embed it as-is in the PR body (or as a
comment) when creating/updating the pull request. Image URLs are anchored to
the head commit SHA when available (preferred over the branch name so they
survive rebases). They use `raw.githubusercontent.com` so they render inline
on GitHub.

The skill **does not** create the pull request itself. Producing valid
`prMarkdown` is the skill's responsibility; emitting the PR is the Loop
Engineering workflow's responsibility.

## How the evidence follows the OpenSpec change during archive

The existing OpenSpec archive command (`@openspec-archive-change`) moves the
entire change directory from `openspec/changes/<id>/` to
`openspec/changes/archive/YYYY-MM-DD-<id>/` via `mv`.

Because the evidence lives at `openspec/changes/<id>/evidence/`, it is
included in the move automatically — there is no separate copy step and no
duplicate evidence in both places. The active change is the source before
archive; the archived change is the source after archive.

```text
before archive:
  openspec/changes/gh-142-bulk-relabel/
    proposal.md
    tasks.md
    archive.md
    evidence/
      final.webp
      flow.gif
      evidence.json

after archive:
  openspec/changes/archive/2026-07-20-gh-142-bulk-relabel/
    proposal.md
    tasks.md
    archive.md
    evidence/
      final.webp
      flow.gif
      evidence.json  (still valid; image URLs anchored to commit SHA keep working)
```

## Coordination with ob-ops-ship

The `@ob-ops-ship` skill captures one-off screenshots via the OpenCode
browser MCP and stores them at `openspec/changes/<id>/images/*.png`. That
flow is **superseded** by this skill for automated visual evidence:

- The new automated flow stores at `openspec/changes/<id>/evidence/` (plural
  files: `final.webp`, `flow.gif`, `evidence.json`).
- `ob-ops-ship` may still be used for ad-hoc manual screenshots when a full
  Playwright scenario is not warranted.
- When both produce evidence for the same change, prefer the
  `visual-evidence` `evidence/` folder; the manual `images/*.png` should be
  removed to avoid duplication.

## System dependencies

| Dependency | Required for | Optional? |
|---|---|---|
| Node.js ≥ 20 | All flows | No |
| pnpm | All flows | No |
| ffmpeg | GIF generation | Yes — skill falls back to screenshot-only when missing |
| xvfb-run | Headless Linux CI | Yes — required only when there is no display |
| Electron system libraries (libatk, libcups, libgtk-3, libnss, …) | Running Electron on Linux | Yes on Linux desktop; required on headless Linux CI |

For a GitHub Actions `ubuntu-latest` runner, install with:

```yaml
- name: Install Electron system deps
  run: |
    sudo apt-get update
    sudo apt-get install -y \
      libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
      libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
      libpango-1.0-0 libcairo2 libasound2 libnss3 libnspr4 libgtk-3-0 \
      xvfb
```

No `.github/workflows/*.yml` file is added by this skill — that is the Loop
Engineering workflow's responsibility. The `visual-evidence` command itself
is CI-compatible and is designed to be invoked under `xvfb-run`.

## Limitations

- Concrete scenario runners must be registered per change-id in
  `src/visual-evidence/scenario-registry.ts`. The framework does not guess
  selectors. Unknown change-ids produce `status: "blocked"`.
- The skill launches the real Electron app. On headless Linux, `xvfb-run` and
  system GUI libraries are required — see above.
- GIF generation depends on ffmpeg. The skill degrades gracefully to
  screenshot-only when ffmpeg is missing.
