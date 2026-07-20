---
name: ob-ops-ship
description: Create a pull request for the current feature branch, with screenshots if UI changed. Load when shipping a finished feature branch. Invoked by the /ops-ship command and the plan-goal pipeline (pr mode).
license: MIT
---

# Ops Ship

## Input

The caller provides (all optional):
- PR title and body. When absent, derive them from the change context (change id, tasks completed, commit list).
- The base branch. When absent, resolve the default branch as shown in the platform steps below.

Repo platform is set in `.opencode/opencode-onboard.json` → `platform.repo`. The platform-specific content below is injected by the CLI during onboarding.

<!-- OB-PLATFORM-SHIP-START -->
**ALL GitHub data MUST come from `gh` CLI. NEVER use webfetch, HTTP requests, or browser MCP tools for GitHub operations, even if gh CLI fails. If `gh` is unavailable, report as a blocker.**
Always pass `--repo {owner}/{repo}` explicitly, never rely on git context to resolve the repo.

---

### Step 1: Verify feature branch

```bash
BRANCH="$(git branch --show-current)"
DEFAULT_BRANCH="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')"
[ -z "$DEFAULT_BRANCH" ] && DEFAULT_BRANCH="main"
```

`$BRANCH` must be a work branch (`feature/*` or `bugfix/*`: the `ob-plan-apply` skill creates `feature/{change-slug}`). NEVER push the default branch.

### Step 2: Capture required evidence

```bash
pnpm visual-evidence --change {change-name}
```

Exit code 1 or 2 blocks shipping. Do not replace a failed or blocked run with
a generic application screenshot. A legitimate non-visual skip exits 0.

### Step 3: Commit and push

The `ob-plan-apply` skill already committed each task group. Stage the
generated evidence directory specifically, never `git add .`:

```bash
git add openspec/changes/{change-name}/evidence/
git commit -m "docs(visual-evidence): {change-name} verified evidence"
git push -u origin "$BRANCH"
```

### Step 4: Create PR

```bash
gh pr create \
  --repo {owner}/{repo} \
  --base "$DEFAULT_BRANCH" \
  --head "$BRANCH" \
  --title "feat({scope}): {title} (#{id})" \
  --body "{description}"
```

### Step 5: Publish verified evidence

```bash
pnpm visual-evidence:publish --change {change-name} --pr {pr-number}
```

The publisher verifies that every asset exists in the remote commit and
creates or updates one evidence comment on both the PR and source issue. Do
not merge, close, or apply a done label when publication fails.

---
<!-- OB-PLATFORM-SHIP-END -->
