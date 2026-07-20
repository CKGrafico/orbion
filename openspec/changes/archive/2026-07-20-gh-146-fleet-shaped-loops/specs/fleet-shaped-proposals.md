# Spec: Fleet-shaped loop proposals

## 1. Shape matching

When a loop-proposal row is being inserted (or rendered for the first time with `status === "pending"`), the renderer calls `matchShapeToFleetIntent(proposalCommand, allCachedShapes)` which:

1. Normalizes the proposal command using `normalizeCommand()` from `fleet-similarity.ts`.
2. Iterates all `LoopShape` entries from other instances, normalizing each shape's command.
3. Scores each shape by command base-name match (0.5 for exact, 0.25 for same base command).
4. Returns the top-scoring shape above a minimum threshold (0.25), or `null`.

The matching function is pure and testable independently.

## 2. Platform adaptation

Given a matched `LoopShape` and the target project's `PlatformType`, `adaptShapeForPlatform(shape, platform)`:

1. Scans the shape's `command`, `commandArgs`, and each `chainSteps[].command` for known platform-specific tokens.
2. Applies substitution rules:
   - `gh` → `az` (and vice versa) when the target platform differs from the source.
   - `github.com` host URLs → `dev.azure.com` equivalents (and vice versa).
   - `--repo owner/repo` → `--organization org --project proj` (GitHub → ADO CLI arg style).
3. Returns an `AdaptedShape` with the adapted command string, adapted args, and a `substitutions` list describing what was changed.
4. If no substitutions are needed (same platform or no recognizable tokens), returns the shape unchanged with an empty `substitutions` list.

The mapping is intentionally conservative: only well-known, unambiguous substitutions are applied. Unknown tokens are left as-is and the user is expected to adjust manually.

## 3. Provenance

The provenance string follows the template:  
`"Based on your {loopName} loop on {instanceName}, adapted for {platformLabel}"`  
where `platformLabel` is derived from `PlatformType` (`"GitHub"`, `"Azure DevOps"`, or omitted if unknown).

If the shape match had no substitutions (same platform), the provenance simplifies to:  
`"Based on your {loopName} loop on {instanceName}"`

## 4. Data flow

```
Agent MCP tool output → SessionChatView stream handler
  ↓
Parse loop-proposal payload
  ↓
LoopShapeCacheService.getAll() → fetch cached shapes
  ↓
matchShapeToFleetIntent(proposal.command, shapes) → matchedShape
  ↓
InfraService.getPlatform(environmentId, projectId) → targetPlatform
  ↓
adaptShapeForPlatform(matchedShape, targetPlatform) → adapted
  ↓
Build LoopProposalRow with adapted command/args + provenance
  ↓
insertLoopProposal() → card rendered with provenance badge
```

## 5. LoopProposalRow additions

```typescript
interface LoopProposalRow extends BaseRow {
  // ... existing fields ...

  /** Provenance string: "Based on your X loop on Y, adapted for Z". Null if no shape match. */
  provenance: string | null;

  /** Source shape metadata when the proposal was pre-shaped from a fleet match. */
  adaptedFrom?: {
    loopId: string;
    environmentId: string;
    environmentName: string;
    loopDescription: string;
    chainSteps: ChainStep[];
    substitutions: Array<{ from: string; to: string; field: string }>;
  } | null;
}
```

## 6. LoopProposalCard rendering

When `row.provenance` is non-null and `row.status === "pending"`:
- A provenance badge appears between the header and command block.
- Renders as: `<icon> <provenance text>` in a subtle chip style (`bg_active`, `text_secondary`, `meta` font size).
- Clicking the badge has no action (informational only).

## 7. i18n keys

```json
{
  "loopProposal": {
    "provenance": "Based on your {loopName} loop on {instanceName}, adapted for {platform}",
    "provenanceSamePlatform": "Based on your {loopName} loop on {instanceName}"
  }
}
```

`platform` values: `GitHub`, `Azure DevOps`.

## 8. Testing

- Unit tests for `matchShapeToFleetIntent()` (various command similarity scenarios).
- Unit tests for `adaptShapeForPlatform()` (gh→az, az→gh, same-platform no-op, unknown tokens preserved).
- Existing test suite must continue passing.
