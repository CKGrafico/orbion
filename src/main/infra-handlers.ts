import { execFile } from "node:child_process";
import type {
  InfraActionArgs,
  InfraActionResult,
  CreateIssueParams,
  CreateIssueResult,
  ListIssuesParams,
  ListIssuesResult,
  IssueCard,
  PlatformType,
  PlatformDetectionResult,
  AddLabelParams,
  AddLabelResult,
  EditIssueParams,
  EditIssueResult,
  BulkRelabelParams,
  BulkRelabelResult,
  BulkRelabelItemResult,
  ListPrsAwaitingReviewParams,
  ListPrsAwaitingReviewResult,
  PrAwaitingReviewItem,
  GetPrVerdictParams,
  GetPrVerdictResult,
  GetPrDiffParams,
  GetPrDiffResult,
  DiffFileEntry,
  GetPrBriefingParams,
  GetPrBriefingResult,
  SubmitPrReviewParams,
  SubmitPrReviewResult,
  OpenPrInBrowserParams,
  ApiResponse,
  Environment,
} from "../shared/ipc.js";
import { msg } from "./i18n.js";
import { resolvePlatformCli } from "./platform-cli.js";
import { ghExec, sanitizeText, validateCliInputs } from "./gh-exec.js";
import { analyzeDiff, classifyDiffSections, parseDiffFiles } from "./diff-analyzer.js";
import { classifyPlatform, parseGitRemoteOutput, detectPlatform, platformCache, platformCacheKey } from "./platform-classifier.js";

// ── Types for dependency injection from index.ts ──────────────────────

export interface InfraHandlerDeps {
  getMainVm: () => Environment | null;
  getEnvironments: () => Environment[];
  resolveActiveUrl: (endpoints: Environment["endpoints"], activeEndpointId: string | null) => string | null;
  handleApiRequest: (args: { baseUrl: string; path: string; method: string; body?: unknown }) => Promise<ApiResponse>;
  /** Get the ConnectionSupervisor status phase for an environment, or null if no supervisor. */
  getSupervisorPhase: (environmentId: string) => string | null;
}

// ── gh issue list JSON field names ────────────────────────────────────

interface GhIssueJson {
  number: number;
  title: string;
  url: string;
  labels: Array<{ name: string }>;
  state: string;
  createdAt: string;
  updatedAt: string;
}

// ── gh pr list JSON field names for PRs awaiting review ──────────────

interface GhPrJson {
  number: number;
  title: string;
  author: { login: string } | null;
  url: string;
  createdAt: string;
  updatedAt: string;
  headRepository: { nameWithOwner: string } | null;
  headRefOid: string;
}

// ── Individual handlers ──────────────────────────────────────────────

function handleListIssues(args: InfraActionArgs): Promise<InfraActionResult> {
  const params = args.params as ListIssuesParams | undefined;
  const labels = params?.labels;
  const state = params?.state ?? "open";
  const repo = params?.repo;
  const limit = Math.min(params?.limit ?? 20, 100);

  return new Promise<InfraActionResult>((resolve) => {
    execFile("gh", ["issue", "list", "--json", "number,title,url,labels,state,createdAt,updatedAt", "--limit", String(limit), "--state", state, ...(labels ? ["--label", labels] : []), ...(repo ? ["--repo", repo] : [])], (err, stdout, stderr) => {
      if (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          resolve({ ok: false, error: msg("issues.noPlatformCli") });
          return;
        }
        resolve({ ok: false, error: msg("issues.listFailed", { detail: stderr || err.message }) });
        return;
      }

      let parsed: GhIssueJson[];
      try {
        parsed = JSON.parse(stdout) as GhIssueJson[];
      } catch {
        resolve({ ok: false, error: msg("issues.listFailed", { detail: "Invalid output from gh CLI" }) });
        return;
      }

      const issues: IssueCard[] = parsed.map((item) => ({
        number: item.number,
        title: item.title,
        url: item.url,
        labels: item.labels.map((l) => l.name),
        state: (item.state === "closed" ? "closed" : "open") as "open" | "closed",
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));

      const result: ListIssuesResult = {
        platform: "github",
        issues,
        total: issues.length,
        truncated: issues.length >= limit,
      };

      resolve({ ok: true, data: result });
    });
  });
}

async function handleListPrsAwaitingReview(args: InfraActionArgs): Promise<InfraActionResult> {
  const params = args.params as ListPrsAwaitingReviewParams | undefined;
  const repo = params?.repo;
  const limit = Math.min(params?.limit ?? 30, 100);

  const cliResult = await ghExec({
    args: [],
    i18nPrefix: "issues",
    requireGh: true,
    validateInputs: repo ? { repo } : undefined,
  });
  if (!cliResult.ok) return cliResult;

  const ghArgs: string[] = [
    "pr", "list",
    "--search", "review-required",
    "--json", "number,title,author,url,createdAt,updatedAt,headRepository,headRefOid",
    "--limit", String(limit),
  ];
  if (repo) {
    ghArgs.push("--repo", repo);
  }

  return new Promise<InfraActionResult>((resolve) => {
    execFile("gh", ghArgs, (err, stdout, stderr) => {
      if (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          resolve({ ok: false, error: msg("issues.noPlatformCli") });
          return;
        }
        resolve({ ok: false, error: msg("issues.listFailed", { detail: stderr || err.message }) });
        return;
      }

      let parsed: GhPrJson[];
      try {
        parsed = JSON.parse(stdout) as GhPrJson[];
      } catch {
        resolve({ ok: false, error: msg("issues.listFailed", { detail: "Invalid output from gh CLI" }) });
        return;
      }

      const prs: PrAwaitingReviewItem[] = parsed.map((item) => ({
        number: item.number,
        title: item.title,
        repo: item.headRepository?.nameWithOwner ?? repo ?? "unknown",
        author: item.author?.login ?? "unknown",
        url: item.url,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        headSha: item.headRefOid ?? "",
      }));

      const result: ListPrsAwaitingReviewResult = {
        platform: "github",
        prs,
        total: prs.length,
        truncated: prs.length >= limit,
      };

      resolve({ ok: true, data: result });
    });
  });
}

async function handleGetPrVerdict(args: InfraActionArgs): Promise<InfraActionResult> {
  const params = args.params as GetPrVerdictParams | undefined;
  const repo = params?.repo;
  const prNumber = params?.number;

  if (!repo || !prNumber) {
    return { ok: false, error: msg("issues.listFailed", { detail: "repo and number are required" }) };
  }

  const cliResult = await ghExec({
    args: [],
    i18nPrefix: "issues",
    requireGh: true,
    validateInputs: { repo },
  });
  if (!cliResult.ok) return cliResult;

  const ghArgs: string[] = [
    "pr", "diff",
    String(prNumber),
    "--repo", repo,
  ];

  return new Promise<InfraActionResult>((resolve) => {
    execFile("gh", ghArgs, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          resolve({ ok: false, error: msg("issues.noPlatformCli") });
          return;
        }
        resolve({ ok: false, error: msg("issues.listFailed", { detail: stderr || err.message }) });
        return;
      }

      const verdict = analyzeDiff(repo, prNumber, stdout);

      const result: GetPrVerdictResult = { verdict };
      resolve({ ok: true, data: result });
    });
  });
}

async function handleGetPrDiff(args: InfraActionArgs): Promise<InfraActionResult> {
  const params = args.params as GetPrDiffParams | undefined;
  const repo = params?.repo;
  const prNumber = params?.number;
  const filePath = params?.path;

  if (!repo || !prNumber) {
    return { ok: false, error: msg("issues.listFailed", { detail: "repo and number are required" }) };
  }

  const cliResult = await ghExec({
    args: [],
    i18nPrefix: "issues",
    requireGh: true,
    validateInputs: { repo },
  });
  if (!cliResult.ok) return cliResult;

  const ghArgs: string[] = [
    "pr", "diff",
    String(prNumber),
    "--repo", repo,
  ];
  if (filePath) {
    ghArgs.push("--", filePath);
  }

  const MAX_DIFF_BYTES = 2 * 1024 * 1024;

  return new Promise<InfraActionResult>((resolve) => {
    execFile("gh", ghArgs, { maxBuffer: MAX_DIFF_BYTES }, (err, stdout, stderr) => {
      if (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          resolve({ ok: false, error: msg("issues.noPlatformCli") });
          return;
        }
        resolve({ ok: false, error: msg("issues.listFailed", { detail: stderr || err.message }) });
        return;
      }

      const files = parseDiffFiles(stdout);
      const truncated = Buffer.byteLength(stdout, "utf8") >= MAX_DIFF_BYTES * 0.95;

      const result: GetPrDiffResult = { diff: stdout, files, truncated };
      resolve({ ok: true, data: result });
    });
  });
}

async function handleGetPrBriefing(args: InfraActionArgs): Promise<InfraActionResult> {
  const params = args.params as GetPrBriefingParams | undefined;
  const repo = params?.repo;
  const prNumber = params?.number;

  if (!repo || !prNumber) {
    return { ok: false, error: msg("issues.listFailed", { detail: "repo and number are required" }) };
  }

  const cliResult = await ghExec({
    args: [],
    i18nPrefix: "issues",
    requireGh: true,
    validateInputs: { repo },
  });
  if (!cliResult.ok) return cliResult;

  const ghArgs: string[] = [
    "pr", "diff",
    String(prNumber),
    "--repo", repo,
  ];

  const MAX_DIFF_BYTES = 2 * 1024 * 1024;

  return new Promise<InfraActionResult>((resolve) => {
    execFile("gh", ghArgs, { maxBuffer: MAX_DIFF_BYTES }, (err, stdout, stderr) => {
      if (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          resolve({ ok: false, error: msg("issues.noPlatformCli") });
          return;
        }
        resolve({ ok: false, error: msg("issues.listFailed", { detail: stderr || err.message }) });
        return;
      }

      const classified = classifyDiffSections(stdout);
      const result: GetPrBriefingResult = {
        sections: classified.sections,
        summary: classified.summary,
        totalFlagged: classified.totalFlagged,
        totalBoilerplate: classified.totalBoilerplate,
      };
      resolve({ ok: true, data: result });
    });
  });
}

async function handleSubmitPrReview(args: InfraActionArgs): Promise<InfraActionResult> {
  const params = args.params as SubmitPrReviewParams | undefined;
  const repo = params?.repo;
  const prNumber = params?.number;
  const event = params?.event;
  const body = params?.body;

  if (!repo || !prNumber || !event) {
    return { ok: false, error: msg("review.submitMissingParams") };
  }

  if (event !== "APPROVE" && event !== "REQUEST_CHANGES") {
    return { ok: false, error: msg("review.submitInvalidEvent") };
  }

  const cliResolved = await resolvePlatformCli(null, "issues");
  if ("error" in cliResolved) {
    return { ok: false, error: cliResolved.error };
  }

  if (cliResolved.cli === "gh") {
    try {
      validateCliInputs({ repo });
    } catch (validationErr) {
      return { ok: false, error: (validationErr as Error).message };
    }

    const ghArgs: string[] = [
      "pr", "review",
      String(prNumber),
      "--repo", repo,
      event === "APPROVE" ? "--approve" : "--request-changes",
    ];
    if (body) {
      ghArgs.push("--body", body);
    }

    return new Promise<InfraActionResult>((resolve) => {
      execFile("gh", ghArgs, (err, _stdout, stderr) => {
        if (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === "ENOENT") {
            resolve({ ok: false, error: msg("issues.noPlatformCli") });
            return;
          }
          resolve({ ok: false, error: msg("review.submitFailed", { detail: stderr || err.message }) });
          return;
        }

        const result: SubmitPrReviewResult = {
          platform: "github",
          number: prNumber,
          event,
        };
        resolve({ ok: true, data: result });
      });
    });
  }

  // ADO (az repos pr set-vote)
  if (cliResolved.cli === "az") {
    const vote = event === "APPROVE" ? "approve" : "wait-for-author";
    const azArgs: string[] = [
      "repos", "pr", "set-vote",
      "--id", String(prNumber),
      "--vote", vote,
    ];
    if (repo) {
      azArgs.push("--org", repo);
    }
    if (body) {
      azArgs.push("--comment", body);
    }

    return new Promise<InfraActionResult>((resolve) => {
      execFile("az", azArgs, (err, _stdout, stderr) => {
        if (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === "ENOENT") {
            resolve({ ok: false, error: msg("issues.noPlatformCli") });
            return;
          }
          resolve({ ok: false, error: msg("review.submitFailed", { detail: stderr || err.message }) });
          return;
        }

        const result: SubmitPrReviewResult = {
          platform: "ado",
          number: prNumber,
          event,
        };
        resolve({ ok: true, data: result });
      });
    });
  }

  return { ok: false, error: msg("review.unsupportedPlatform") };
}

function handleOpenPrInBrowser(args: InfraActionArgs): Promise<InfraActionResult> {
  const params = args.params as OpenPrInBrowserParams | undefined;
  const url = params?.url;

  if (!url) {
    return Promise.resolve({ ok: false, error: msg("review.openOnWebMissingUrl") });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return Promise.resolve({ ok: false, error: msg("review.openOnWebInvalidUrl") });
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return Promise.resolve({ ok: false, error: msg("review.openOnWebInvalidUrl") });
  }

  // shell.openExternal is called back in index.ts
  return Promise.resolve({ ok: true, data: { url } });
}

// ── Main dispatcher ──────────────────────────────────────────────────

export async function handleInfraExecuteAction(
  args: InfraActionArgs,
  deps: InfraHandlerDeps,
): Promise<InfraActionResult> {
  const mainVmEnv = deps.getMainVm();
  if (!mainVmEnv) {
    return { ok: false, error: msg("vmWizard.mainNoMainVm") };
  }
  const url = deps.resolveActiveUrl(mainVmEnv.endpoints, mainVmEnv.activeEndpointId);
  if (!url) {
    return { ok: false, error: msg("vmWizard.mainNoEndpoint") };
  }

  switch (args.action) {
    case "machine-status": {
      const envs = deps.getEnvironments();
      const results: Array<{ id: string; name: string; health: string; endpoints: Array<{ url: string; kind: string }> }> = [];
      for (const env of envs) {
        const phase = deps.getSupervisorPhase(env.id) ?? "offline";
        results.push({
          id: env.id,
          name: env.name,
          health: phase,
          endpoints: env.endpoints.map((ep) => ({ url: ep.url, kind: ep.kind })),
        });
      }
      return { ok: true, data: results };
    }
    case "clone-repo": {
      const repoUrl = args.params?.repoUrl as string | undefined;
      const targetVmId = args.params?.targetVmId as string | undefined;
      if (!repoUrl) {
        return { ok: false, error: msg("vmWizard.mainRepoUrlRequired") };
      }
      const targetEnv = targetVmId
        ? deps.getEnvironments().find((e: Environment) => e.id === targetVmId)
        : mainVmEnv;
      if (!targetEnv) {
        return { ok: false, error: msg("vmWizard.mainTargetVmNotFound") };
      }
      const targetUrl = deps.resolveActiveUrl(targetEnv.endpoints, targetEnv.activeEndpointId);
      if (!targetUrl) {
        return { ok: false, error: msg("vmWizard.mainTargetVmNoEndpoint") };
      }
      const cloneResult = await deps.handleApiRequest({
        baseUrl: targetUrl,
        path: "/api/repos/clone",
        method: "POST",
        body: { url: repoUrl },
      });
      if (!cloneResult.ok) {
        return { ok: false, error: cloneResult.error ?? msg("vmWizard.mainCloneFailed") };
      }
      return { ok: true, data: { vm: targetEnv.name, repoUrl, result: cloneResult.data } };
    }
    case "detect-platform": {
      const envId = args.params?.environmentId as string | undefined;
      const projectId = (args.params?.projectId as string | undefined) ?? "";
      const directory = args.params?.directory as string | undefined;
      const force = (args.params?.force as boolean | undefined) ?? false;

      if (!envId) {
        return { ok: false, error: msg("platformDetect.envIdRequired") };
      }

      const key = platformCacheKey(envId, projectId);
      if (!force && platformCache.has(key)) {
        const cached: PlatformDetectionResult = {
          platform: platformCache.get(key)!,
          remotes: [],
          cached: true,
        };
        return { ok: true, data: cached };
      }

      if (!directory) {
        platformCache.set(key, "unknown");
        const result: PlatformDetectionResult = {
          platform: "unknown",
          remotes: [],
          cached: false,
        };
        return { ok: true, data: result };
      }

      const platform = await detectPlatform(directory);
      platformCache.set(key, platform);

      let remotes: string[] = [];
      try {
        remotes = await new Promise<string[]>((resolve) => {
          execFile("git", ["remote", "-v"], { cwd: directory, timeout: 10_000 }, (err, stdout) => {
            if (err) { resolve([]); return; }
            resolve(parseGitRemoteOutput(stdout));
          });
        });
      } catch {
        // best effort
      }

      const result: PlatformDetectionResult = {
        platform,
        remotes,
        cached: false,
      };
      return { ok: true, data: result };
    }
    case "create-issue": {
      const params = args.params as CreateIssueParams | undefined;
      if (!params?.title) {
        return { ok: false, error: msg("issues.titleRequired") };
      }

      const cachedPlatform = args.params?.projectId
        ? platformCache.get(platformCacheKey(mainVmEnv.id, args.params.projectId as string))
        : undefined;

      let preferredCli: "gh" | "az" | null = null;
      if (cachedPlatform === "github") {
        preferredCli = "gh";
      } else if (cachedPlatform === "ado") {
        preferredCli = "az";
      }

      const cliResolved = await resolvePlatformCli(preferredCli, "issues");
      if ("error" in cliResolved) {
        return { ok: false, error: cliResolved.error };
      }
      const useCli = cliResolved.cli;

      const title = sanitizeText(params.title);
      const body = sanitizeText(params.body ?? "");
      const labels = params.labels ?? [];
      const repo = params.repo;

      try {
        validateCliInputs({ title, body, labels, repo });
      } catch (validationErr) {
        return { ok: false, error: (validationErr as Error).message };
      }

      if (useCli === "gh") {
        const ghArgs: string[] = ["issue", "create", "--title", title, "--body", body];
        for (const label of labels) {
          ghArgs.push("--label", label);
        }
        if (repo) {
          ghArgs.push("--repo", repo);
        }
        return new Promise<InfraActionResult>((resolve) => {
          execFile("gh", ghArgs, (err, _stdout, stderr) => {
            if (err) {
              resolve({ ok: false, error: msg("issues.createFailed", { detail: stderr || err.message }) });
              return;
            }
            const issueUrl = _stdout.trim();
            const numberMatch = issueUrl.match(/\/issues\/(\d+)$/);
            const result: CreateIssueResult = {
              platform: "github",
              url: issueUrl,
              number: numberMatch ? parseInt(numberMatch[1], 10) : undefined,
            };
            resolve({ ok: true, data: result });
          });
        });
      }

      // az boards work-item create
      const azArgs: string[] = [
        "boards", "work-item", "create",
        "--title", title,
        "--description", body,
        "--type", "Issue",
      ];
      return new Promise<InfraActionResult>((resolve) => {
        execFile("az", azArgs, (err, stdout, stderr) => {
          if (err) {
            resolve({ ok: false, error: msg("issues.createFailed", { detail: stderr || err.message }) });
            return;
          }
          try {
            const parsed = JSON.parse(stdout) as { id?: number; url?: string };
            const result: CreateIssueResult = {
              platform: "ado",
              url: parsed.url ?? "",
              number: parsed.id,
            };
            resolve({ ok: true, data: result });
          } catch {
            resolve({ ok: false, error: msg("issues.createFailed", { detail: "Unexpected output from az CLI" }) });
          }
        });
      });
    }
    case "list-issues": {
      return handleListIssues(args);
    }
    case "add-label": {
      const params = args.params as AddLabelParams | undefined;
      if (!params?.issueNumber || !params.labels?.length) {
        return { ok: false, error: msg("labels.issueNumberAndLabelsRequired") };
      }

      const cliResolved = await resolvePlatformCli(null, "labels");
      if ("error" in cliResolved) {
        return { ok: false, error: cliResolved.error };
      }
      if (cliResolved.cli !== "gh") {
        return { ok: false, error: msg("labels.ghRequiredForLabels") };
      }

      try {
        validateCliInputs({ labels: params.labels, repo: params.repo });
      } catch (validationErr) {
        return { ok: false, error: (validationErr as Error).message };
      }

      const labelArgs: string[] = [
        "issue", "edit", String(params.issueNumber),
        "--add-label", params.labels.join(","),
      ];
      if (params.repo) {
        labelArgs.push("--repo", params.repo);
      }

      return new Promise<InfraActionResult>((resolve) => {
        execFile("gh", labelArgs, (err, _stdout, stderr) => {
          if (err) {
            resolve({ ok: false, error: msg("labels.addFailed", { detail: stderr || err.message }) });
            return;
          }
          const result: AddLabelResult = {
            issueNumber: params.issueNumber,
            labels: params.labels,
          };
          resolve({ ok: true, data: result });
        });
      });
    }
    case "edit-issue": {
      const params = args.params as EditIssueParams | undefined;
      if (!params?.issueNumber) {
        return { ok: false, error: msg("editIssue.issueNumberRequired") };
      }
      if (!params.title && !params.body && !params.addLabels?.length && !params.removeLabels?.length) {
        return { ok: false, error: msg("editIssue.noChanges") };
      }

      const cachedPlatform = args.params?.projectId
        ? platformCache.get(platformCacheKey(mainVmEnv.id, args.params.projectId as string))
        : undefined;

      let preferredCli: "gh" | "az" | null = null;
      if (cachedPlatform === "github") {
        preferredCli = "gh";
      } else if (cachedPlatform === "ado") {
        preferredCli = "az";
      }

      const cliResolved = await resolvePlatformCli(preferredCli, "editIssue");
      if ("error" in cliResolved) {
        return { ok: false, error: cliResolved.error };
      }
      const useCli = cliResolved.cli;

      if (useCli === "az" && (params.addLabels?.length || params.removeLabels?.length)) {
        return { ok: false, error: msg("editIssue.adoLabelsNotSupported") };
      }

      const sanitizedTitle = params.title ? sanitizeText(params.title) : undefined;
      const sanitizedBody = params.body ? sanitizeText(params.body) : undefined;

      try {
        validateCliInputs({
          title: sanitizedTitle,
          body: sanitizedBody,
          labels: [...(params.addLabels ?? []), ...(params.removeLabels ?? [])],
          repo: params.repo,
        });
      } catch (validationErr) {
        return { ok: false, error: (validationErr as Error).message };
      }

      if (useCli === "gh") {
        const ghArgs: string[] = ["issue", "edit", String(params.issueNumber)];
        if (sanitizedTitle) {
          ghArgs.push("--title", sanitizedTitle);
        }
        if (sanitizedBody) {
          ghArgs.push("--body", sanitizedBody);
        }
        if (params.addLabels?.length) {
          ghArgs.push("--add-label", params.addLabels.join(","));
        }
        if (params.removeLabels?.length) {
          ghArgs.push("--remove-label", params.removeLabels.join(","));
        }
        if (params.repo) {
          ghArgs.push("--repo", params.repo);
        }

        const changes: EditIssueResult["changes"] = {};
        if (sanitizedTitle) changes.title = true;
        if (sanitizedBody) changes.body = true;
        if (params.addLabels?.length) changes.labelsAdded = params.addLabels;
        if (params.removeLabels?.length) changes.labelsRemoved = params.removeLabels;

        return new Promise<InfraActionResult>((resolve) => {
          execFile("gh", ghArgs, (err, _stdout, stderr) => {
            if (err) {
              resolve({ ok: false, error: msg("editIssue.editFailed", { detail: stderr || err.message }) });
              return;
            }
            const result: EditIssueResult = {
              platform: "github",
              issueNumber: params.issueNumber,
              changes,
            };
            resolve({ ok: true, data: result });
          });
        });
      }

      // az boards work-item update
      const azArgs: string[] = [
        "boards", "work-item", "update",
        "--id", String(params.issueNumber),
      ];
      if (sanitizedTitle) {
        azArgs.push("--title", sanitizedTitle);
      }
      if (sanitizedBody) {
        azArgs.push("--description", sanitizedBody);
      }

      const changes: EditIssueResult["changes"] = {};
      if (sanitizedTitle) changes.title = true;
      if (sanitizedBody) changes.body = true;

      return new Promise<InfraActionResult>((resolve) => {
        execFile("az", azArgs, (err, stdout, stderr) => {
          if (err) {
            resolve({ ok: false, error: msg("editIssue.editFailed", { detail: stderr || err.message }) });
            return;
          }
          try {
            const parsed = JSON.parse(stdout) as { id?: number };
            const result: EditIssueResult = {
              platform: "ado",
              issueNumber: parsed.id ?? params.issueNumber,
              changes,
            };
            resolve({ ok: true, data: result });
          } catch {
            resolve({ ok: false, error: msg("editIssue.editFailed", { detail: "Unexpected output from az CLI" }) });
          }
        });
      });
    }
    case "bulk-relabel": {
      const params = args.params as BulkRelabelParams | undefined;
      if (!params?.issueNumbers?.length) {
        return { ok: false, error: msg("bulkRelabel.issueNumbersRequired") };
      }
      if (!params.addLabels?.length && !params.removeLabels?.length) {
        return { ok: false, error: msg("bulkRelabel.noLabels") };
      }

      const cliResolved = await resolvePlatformCli(null, "labels");
      if ("error" in cliResolved) {
        return { ok: false, error: cliResolved.error };
      }
      if (cliResolved.cli !== "gh") {
        return { ok: false, error: msg("labels.ghRequiredForLabels") };
      }

      try {
        validateCliInputs({
          labels: [...(params.addLabels ?? []), ...(params.removeLabels ?? [])],
          repo: params.repo,
        });
      } catch (validationErr) {
        return { ok: false, error: (validationErr as Error).message };
      }

      const items: BulkRelabelItemResult[] = [];
      let succeeded = 0;
      let failed = 0;

      for (const issueNumber of params.issueNumbers) {
        const ghArgs: string[] = ["issue", "edit", String(issueNumber)];
        if (params.addLabels.length) {
          ghArgs.push("--add-label", params.addLabels.join(","));
        }
        if (params.removeLabels?.length) {
          ghArgs.push("--remove-label", params.removeLabels.join(","));
        }
        if (params.repo) {
          ghArgs.push("--repo", params.repo);
        }

        const itemResult = await new Promise<BulkRelabelItemResult>((resolve) => {
          execFile("gh", ghArgs, (err, _stdout, stderr) => {
            if (err) {
              resolve({ issueNumber, ok: false, error: stderr || err.message });
            } else {
              resolve({ issueNumber, ok: true });
            }
          });
        });

        items.push(itemResult);
        if (itemResult.ok) {
          succeeded++;
        } else {
          failed++;
        }
      }

      const result: BulkRelabelResult = { items, succeeded, failed };
      return { ok: true, data: result };
    }
    case "list-prs-awaiting-review": {
      return handleListPrsAwaitingReview(args);
    }
    case "get-pr-verdict": {
      return handleGetPrVerdict(args);
    }
    case "get-pr-diff": {
      return handleGetPrDiff(args);
    }
    case "get-pr-briefing": {
      return handleGetPrBriefing(args);
    }
    case "submit-pr-review": {
      return handleSubmitPrReview(args);
    }
    case "open-pr-in-browser": {
      return handleOpenPrInBrowser(args);
    }
    default:
      return { ok: false, error: msg("vmWizard.mainUnknownAction", { action: args.action }) };
  }
}
