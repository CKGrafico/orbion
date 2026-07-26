import { injectable } from "inversify-hooks";
import type { IInboxService, InboxBuildParams, IApiService, IConfigService } from "../interfaces";
import type { InboxItem, InboxAction, InboxQueryResult, ResolvedInboxItem, InboxItemResolutionReason, ApiResponse, DigestCounts } from "../../../../shared/ipc";
import { kindToNotificationType } from "../../../../shared/ipc";
import { cid, container } from "inversify-hooks";
import { loopStatusToFleetItem } from "../../fleet-mapping";
import type { LoopStatus } from "../../types";

function getResolutionReasonForItem(item: InboxItem): InboxItemResolutionReason {
  switch (item.kind) {
    case "failed-loop":
      return "loop-recovered";
    case "finished-loop":
      return "loop-recovered";
    case "breach":
    case "pending-approval":
    case "awaiting-input":
      return "watch-cleared";
    case "instance-offline":
      return "instance-online";
    case "prolonged-offline":
      return "outage-resolved";
    case "pr-awaiting-review":
      return "pr-resolved";
    case "digest":
      return "watch-cleared";
    default:
      return "loop-recovered";
  }
}

function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (hours < 24) return min > 0 ? `${hours}h ${min}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

const DIGEST_MIN_PRS = 2;

/** Group pr-awaiting-review items into a digest when 2+. Verdicts: safe / needs you / conflict. */
function groupPrsIntoDigest(
  items: InboxItem[],
  dismissedIds: Set<string>,
  mainVmEnvironmentId: string | null,
  mainVmEnvironmentName: string,
): InboxItem[] {
  const prItems = items.filter((i) => i.kind === "pr-awaiting-review");
  const nonPrItems = items.filter((i) => i.kind !== "pr-awaiting-review");

  if (prItems.length < DIGEST_MIN_PRS) {
    return items;
  }

  let safe = 0;
  let needsYou = 0;
  let conflict = 0;

  for (const pr of prItems) {
    const risk = pr.prVerdict?.riskLevel;
    if (risk === "low") {
      safe++;
    } else if (risk === "medium" || risk === "high") {
      needsYou++;
    } else {
      conflict++;
    }
  }

  const digestCounts: DigestCounts = {
    safe,
    needsYou,
    conflict,
    total: prItems.length,
  };

  // Build digest title: "10 PRs overnight: 7 safe, 2 need you, 1 conflict"
  const parts: string[] = [];
  if (safe > 0) parts.push(`${safe} safe`);
  if (needsYou > 0) parts.push(`${needsYou} need${needsYou === 1 ? "s" : ""} you`);
  if (conflict > 0) parts.push(`${conflict} conflict${conflict === 1 ? "" : "s"}`);

  const digestTitle = `${prItems.length} PR${prItems.length !== 1 ? "s" : ""} overnight: ${parts.join(", ")}`;
  const childItemIds = prItems.map((p) => p.id);

  const latestOccurredAt = prItems.reduce((latest, p) => {
    const t = new Date(p.occurredAt).getTime();
    return t > latest ? t : latest;
  }, 0);

  const digestItem: InboxItem = {
    id: `digest:pr-awaiting-review:${mainVmEnvironmentId ?? "unknown"}`,
    kind: "digest",
    notificationType: kindToNotificationType("digest"),
    environmentId: mainVmEnvironmentId ?? "",
    environmentName: mainVmEnvironmentName,
    title: digestTitle,
    detail: undefined,
    occurredAt: new Date(latestOccurredAt).toISOString(),
    dismissed: false,
    availableActions: getAvailableActions("digest"),
    childItemIds,
    digestCounts,
  };

  if (dismissedIds.has(digestItem.id)) {
    const visiblePrIds = new Set(childItemIds);
    const remainingPrs = prItems.filter((p) => !dismissedIds.has(p.id) && !visiblePrIds.has(p.id));
    return [...nonPrItems, ...remainingPrs];
  }

  return [...nonPrItems, digestItem];
}

/** Action mapping: failed→run/pause/chat, finished→dismiss/restart, breach→dismiss/chat, offline→dismiss, approval/input→chat. */
function getAvailableActions(kind: InboxItem["kind"], _loopStatus?: LoopStatus): InboxAction[] {
  switch (kind) {
    case "failed-loop":
      return ["run-now", "pause", "open-in-chat"];
    case "finished-loop":
      return ["dismiss", "restart"];
    case "breach":
      return ["dismiss", "open-in-chat"];
    case "instance-offline":
    case "prolonged-offline":
      return ["dismiss"];
    case "pending-approval":
    case "awaiting-input":
      return ["open-in-chat"];
    case "pr-awaiting-review":
      return ["dismiss", "open-in-chat"];
    case "digest":
      return ["dismiss", "open-in-chat"];
    default:
      return ["dismiss"];
  }
}

/** Items are derived from live fleet data (not persisted). Prolonged-offline appears only when the OutageTracker escalates (~10 min threshold). */
function deriveItemsUngrouped(params: InboxBuildParams): InboxItem[] {
  const { perEnvLoops, perEnvHealth, environments, breaches, dismissedIds, escalatedOutages, prAwaitingReview, mainVmEnvironmentId, mainVmEnvironmentName, prVerdicts } = params;
  const items: InboxItem[] = [];

  // 1. Budget breaches
  for (const breach of breaches) {
    if (breach.dismissed) continue;
    if (dismissedIds.has(`breach:${breach.id}`)) continue;
    items.push({
      id: `breach:${breach.id}`,
      kind: "breach",
      notificationType: kindToNotificationType("breach"),
      environmentId: breach.environmentId,
      environmentName: breach.environmentName,
      loopId: breach.loopId,
      title: breach.loopDescription,
      detail: `${breach.runsToday}/${breach.threshold} runs${breach.autoPaused ? " \u00b7 paused" : ""}`,
      occurredAt: breach.breachedAt,
      dismissed: false,
      availableActions: getAvailableActions("breach"),
    });
  }

  // 2. PRs awaiting review
  if (mainVmEnvironmentId && prAwaitingReview.length > 0) {
    for (const pr of prAwaitingReview) {
      const itemId = `pr-awaiting-review:${pr.repo}:${pr.number}`;
      if (dismissedIds.has(itemId)) continue;

      const verdictKey = `${pr.repo}:${pr.number}`;
      const verdict = prVerdicts.get(verdictKey);

      items.push({
        id: itemId,
        kind: "pr-awaiting-review",
        notificationType: kindToNotificationType("pr-awaiting-review"),
        environmentId: mainVmEnvironmentId,
        environmentName: mainVmEnvironmentName,
        title: pr.title,
        detail: `#${pr.number} in ${pr.repo} by @${pr.author}`,
        occurredAt: pr.updatedAt,
        dismissed: false,
        availableActions: getAvailableActions("pr-awaiting-review"),
        prNumber: pr.number,
        prRepo: pr.repo,
        prAuthor: pr.author,
        prUrl: pr.url,
        prVerdict: verdict,
      });
    }
  }

  // 3. Loop-derived items
  for (const env of environments) {
    const health = perEnvHealth[env.id];

    const escalated = escalatedOutages.get(env.id);
    if (escalated) {
      if (!dismissedIds.has(`prolonged-offline:${env.id}`)) {
        items.push({
          id: `prolonged-offline:${env.id}`,
          kind: "prolonged-offline",
          notificationType: kindToNotificationType("prolonged-offline"),
          environmentId: env.id,
          environmentName: env.name,
          title: env.name,
          detail: `unreachable for ${formatDuration(escalated.durationMs)}`,
          occurredAt: escalated.since,
          outageSince: escalated.since,
          dismissed: false,
          availableActions: getAvailableActions("prolonged-offline"),
        });
      }
      continue;
    }

    if (health === "offline" || health === "blocked" || health === "unknown") {
      if (!dismissedIds.has(`offline:${env.id}`)) {
        items.push({
          id: `offline:${env.id}`,
          kind: "instance-offline",
          notificationType: kindToNotificationType("instance-offline"),
          environmentId: env.id,
          environmentName: env.name,
          title: env.name,
          detail: health === "blocked" ? "blocked" : "offline",
          occurredAt: new Date().toISOString(),
          dismissed: false,
          availableActions: getAvailableActions("instance-offline"),
        });
      }
      continue;
    }

    const envLoops = perEnvLoops[env.id] ?? [];
    for (const loop of envLoops) {
      const isFinished = loop.maxRuns !== null && loop.runCount >= loop.maxRuns;
      const isFailed = loop.lastExitCode !== null && loop.lastExitCode !== 0;

      if (isFailed && !isFinished) {
        const itemId = `failed-loop:${env.id}:${loop.id}`;
        if (dismissedIds.has(itemId)) continue;

        items.push({
          id: itemId,
          kind: "failed-loop",
          notificationType: kindToNotificationType("failed-loop"),
          environmentId: env.id,
          environmentName: env.name,
          loopId: loop.id,
          title: loop.description?.trim() || loop.id,
          detail: loop.lastExitCode !== null ? `exit ${loop.lastExitCode}` : undefined,
          occurredAt: loop.lastRunAt ?? new Date().toISOString(),
          dismissed: false,
          availableActions: getAvailableActions("failed-loop", loop.status),
          projectId: loop.projectId,
        });
      } else if (isFinished) {
        const itemId = `finished-loop:${env.id}:${loop.id}`;
        if (dismissedIds.has(itemId)) continue;

        items.push({
          id: itemId,
          kind: "finished-loop",
          notificationType: kindToNotificationType("finished-loop"),
          environmentId: env.id,
          environmentName: env.name,
          loopId: loop.id,
          title: loop.description?.trim() || loop.id,
          detail: `${loop.runCount}/${loop.maxRuns} runs`,
          occurredAt: loop.lastRunAt ?? new Date().toISOString(),
          dismissed: false,
          availableActions: getAvailableActions("finished-loop"),
          projectId: loop.projectId,
        });
      }
    }
  }

  items.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  return items;
}

/** Build inbox items with digest grouping applied. */
function deriveItems(params: InboxBuildParams): InboxItem[] {
  const items = deriveItemsUngrouped(params);
  const { dismissedIds, mainVmEnvironmentId, mainVmEnvironmentName } = params;
  return groupPrsIntoDigest(items, dismissedIds, mainVmEnvironmentId, mainVmEnvironmentName);
}

/** Local deterministic query engine (no LLM) for natural-language fleet questions. */
function answerFleetQuery(
  question: string,
  items: InboxItem[],
  params: InboxBuildParams,
): InboxQueryResult {
  const q = question.toLowerCase().trim();
  const references: InboxItem[] = [];

  const isNeedsMe =
    q.includes("needs me") ||
    q.includes("need me") ||
    q.includes("needs attention") ||
    q.includes("need attention") ||
    q.includes("morning") ||
    q.includes("what's up") ||
    q.includes("whats up") ||
    q.includes("status") ||
    q.includes("overview") ||
    q.includes("summary") ||
    q.includes("anything");

  if (isNeedsMe || q.length === 0) {
    if (items.length === 0) {
      return {
        answer: "All clear! Nothing needs your attention right now.",
        references: [],
      };
    }

    const lines: string[] = [`**${items.length} item${items.length !== 1 ? "s" : ""} need your attention:**\n`];

    for (const item of items.slice(0, 10)) {
      references.push(item);
      const envTag = item.environmentName;
      const link = `[${item.title}](inbox://${item.id})`;
      const kindLabel = item.kind === "breach"
        ? "budget breach"
        : item.kind === "failed-loop"
        ? "failed loop"
        : item.kind === "finished-loop"
        ? "finished loop"
        : item.kind === "instance-offline"
        ? "instance offline"
        : item.kind === "prolonged-offline"
        ? "prolonged outage"
        : item.kind === "pending-approval"
        ? "approval needed"
        : item.kind === "awaiting-input"
        ? "input needed"
        : item.kind === "pr-awaiting-review"
        ? "PR awaiting review"
        : item.kind;

      if (item.loopId) {
        lines.push(`- ${link} on **${envTag}** - ${kindLabel}${item.detail ? ` (${item.detail})` : ""}`);
      } else {
        lines.push(`- ${link} - ${kindLabel}${item.detail ? ` (${item.detail})` : ""}`);
      }
    }

    if (items.length > 10) {
      lines.push(`\n…and ${items.length - 10} more.`);
    }

    return { answer: lines.join("\n"), references };
  }

  const isFailedQuery =
    q.includes("fail") ||
    q.includes("error") ||
    q.includes("broken");

  if (isFailedQuery) {
    const failed = items.filter((i) => i.notificationType === "failure");
    if (failed.length === 0) {
      return { answer: "No failures or errors across the fleet right now.", references: [] };
    }
    const lines: string[] = [`**${failed.length} failure${failed.length !== 1 ? "s" : ""} found:**\n`];
    for (const item of failed.slice(0, 10)) {
      references.push(item);
      const link = `[${item.title}](inbox://${item.id})`;
      lines.push(`- ${link} on **${item.environmentName}**${item.detail ? ` (${item.detail})` : ""}`);
    }
    return { answer: lines.join("\n"), references };
  }

  const isOfflineQuery =
    q.includes("offline") ||
    q.includes("disconnected") ||
    q.includes("unreachable") ||
    q.includes("down");

  if (isOfflineQuery) {
    const offline = items.filter((i) => i.notificationType === "failure" && (i.kind === "instance-offline" || i.kind === "prolonged-offline"));
    if (offline.length === 0) {
      return { answer: "All instances are reachable.", references: [] };
    }
    const lines: string[] = [`**${offline.length} instance${offline.length !== 1 ? "s" : ""} offline:**\n`];
    for (const item of offline) {
      references.push(item);
      const link = `[${item.title}](inbox://${item.id})`;
      lines.push(`- ${link}${item.detail ? ` (${item.detail})` : ""}`);
    }
    return { answer: lines.join("\n"), references };
  }

  const isFinishedQuery =
    q.includes("finished") ||
    q.includes("completed") ||
    q.includes("done loop");

  if (isFinishedQuery) {
    const finishedItems = items.filter((i) => i.notificationType === "finished");
    if (finishedItems.length === 0) {
      return { answer: "No finished loops right now.", references: [] };
    }
    const lines: string[] = [`**${finishedItems.length} finished loop${finishedItems.length !== 1 ? "s" : ""}:**\n`];
    for (const item of finishedItems.slice(0, 10)) {
      references.push(item);
      const link = `[${item.title}](inbox://${item.id})`;
      lines.push(`- ${link} on **${item.environmentName}**${item.detail ? ` (${item.detail})` : ""}`);
    }
    return { answer: lines.join("\n"), references };
  }

  const isBudgetQuery =
    q.includes("breach") ||
    q.includes("budget") ||
    q.includes("over budget") ||
    q.includes("threshold");

  if (isBudgetQuery) {
    const breachItems = items.filter((i) => i.kind === "breach");
    if (breachItems.length === 0) {
      return { answer: "No budget breaches right now.", references: [] };
    }
    const lines: string[] = [`**${breachItems.length} budget breach${breachItems.length !== 1 ? "es" : ""}:**\n`];
    for (const item of breachItems) {
      references.push(item);
      const link = `[${item.title}](inbox://${item.id})`;
      lines.push(`- ${link} on **${item.environmentName}**${item.detail ? ` (${item.detail})` : ""}`);
    }
    return { answer: lines.join("\n"), references };
  }

  const isWatchQuery =
    q.includes("watch") ||
    q.includes("alert") ||
    q.includes("notification");

  if (isWatchQuery) {
    const watchItems = items.filter((i) => i.notificationType === "watch");
    if (watchItems.length === 0) {
      return { answer: "No active watches or alerts right now.", references: [] };
    }
    const lines: string[] = [`**${watchItems.length} watch alert${watchItems.length !== 1 ? "s" : ""}:**\n`];
    for (const item of watchItems.slice(0, 10)) {
      references.push(item);
      const link = `[${item.title}](inbox://${item.id})`;
      lines.push(`- ${link} on **${item.environmentName}**${item.detail ? ` (${item.detail})` : ""}`);
    }
    return { answer: lines.join("\n"), references };
  }

  const isPrQuery =
    q.includes("pr") ||
    q.includes("pull request") ||
    q.includes("review");

  if (isPrQuery) {
    const digestItems = items.filter((i) => i.kind === "digest" && i.childItemIds && i.childItemIds.length > 0);
    const prItems = items.filter((i) => i.kind === "pr-awaiting-review");

    if (digestItems.length === 0 && prItems.length === 0) {
      return { answer: "No PRs awaiting your review right now.", references: [] };
    }

    if (digestItems.length > 0) {      const lines: string[] = [];
      for (const digest of digestItems) {
        references.push(digest);
        const counts = digest.digestCounts;
        const countParts: string[] = [];
        if (counts) {
          if (counts.safe > 0) countParts.push(`${counts.safe} safe`);
          if (counts.needsYou > 0) countParts.push(`${counts.needsYou} need you`);
          if (counts.conflict > 0) countParts.push(`${counts.conflict} conflict${counts.conflict !== 1 ? "s" : ""}`);
        }
        lines.push(`**${digest.title}**\n`);
        for (const childId of digest.childItemIds ?? []) {
          const child = prItems.find((p) => p.id === childId);
          if (child) {
            references.push(child);
            const link = `[${child.title}](inbox://${child.id})`;
            lines.push(`- ${link}${child.detail ? ` (${child.detail})` : ""}`);
          }
        }
      }
      return { answer: lines.join("\n"), references };
    }

    const lines: string[] = [`**${prItems.length} PR${prItems.length !== 1 ? "s" : ""} awaiting your review:**\n`];
    for (const item of prItems.slice(0, 10)) {
      references.push(item);
      const link = `[${item.title}](inbox://${item.id})`;
      lines.push(`- ${link}${item.detail ? ` (${item.detail})` : ""}`);
    }
    return { answer: lines.join("\n"), references };
  }

  const { perEnvLoops, environments, perEnvHealth } = params;
  let totalLoops = 0;
  let totalRunning = 0;
  let totalFailed = 0;

  for (const env of environments) {
    const health = perEnvHealth[env.id];
    if (health === "offline" || health === "blocked" || health === "unknown") continue;
    const envLoops = perEnvLoops[env.id] ?? [];
    totalLoops += envLoops.length;
    for (const loop of envLoops) {
      if (loop.status === "running") totalRunning++;
      const fleetItem = loopStatusToFleetItem(loop.status, loop.lastExitCode);
      if (fleetItem === "failed") totalFailed++;
    }
  }

  const reachableEnvs = environments.filter((e) => {
    const h = perEnvHealth[e.id];
    return h !== "offline" && h !== "blocked" && h !== "unknown";
  }).length;

  let answer = `**Fleet overview:** ${reachableEnvs}/${environments.length} instances reachable, ${totalLoops} loops (${totalRunning} running, ${totalFailed} failed).`;
  if (items.length > 0) {
    answer += `\n\n${items.length} item${items.length !== 1 ? "s" : ""} need attention. Try asking "what needs me?" for details.`;
  }
  return { answer, references };
}

@injectable()
export class InboxService implements IInboxService {
  private getConfigService(): IConfigService {
    return container.get<IConfigService>(cid.IConfigService as unknown as string);
  }

  private getApiService(): IApiService {
    return container.get<IApiService>(cid.IApiService as unknown as string);
  }

  private async resolveBaseUrl(environmentId: string): Promise<string> {
    const envs = await this.getConfigService().getEnvironments();
    const env = envs.find((e) => e.id === environmentId);
    if (!env) return "";
    if (env.activeEndpointId) {
      const ep = env.endpoints.find((e) => e.id === env.activeEndpointId);
      if (ep) return ep.url;
    }
    return env.endpoints.length > 0 ? env.endpoints[0].url : "";
  }

  async getDismissedIds(): Promise<string[]> {
    if (!window.api) return [];
    return window.api.inbox.getDismissedIds();
  }

  async dismissItem(itemId: string): Promise<void> {
    if (!window.api) return;
    await window.api.inbox.dismissItem(itemId);
  }

  buildItems(params: InboxBuildParams): InboxItem[] {
    return deriveItems(params);
  }

  getChildItems(digestItem: InboxItem, params: InboxBuildParams): InboxItem[] {
    if (digestItem.kind !== "digest" || !digestItem.childItemIds) return [];

    const allItems = deriveItemsUngrouped(params);
    const childIds = new Set(digestItem.childItemIds);
    return allItems.filter((i) => childIds.has(i.id));
  }

  queryFleet(question: string, params: InboxBuildParams): InboxQueryResult {
    const items = this.buildItems(params);
    return answerFleetQuery(question, items, params);
  }

  async resolveItem(resolved: ResolvedInboxItem): Promise<void> {
    if (!window.api) return;
    await window.api.inbox.resolveItem(resolved);
  }

  async getResolvedItems(): Promise<ResolvedInboxItem[]> {
    if (!window.api) return [];
    return window.api.inbox.getResolvedItems();
  }

  async pruneResolvedItems(): Promise<void> {
    if (!window.api) return;
    await window.api.inbox.pruneResolvedItems();
  }

  detectAutoResolutions(
    previousItems: InboxItem[],
    currentIds: Set<string>,
    dismissedIds: Set<string>,
  ): ResolvedInboxItem[] {
    const resolved: ResolvedInboxItem[] = [];
    const now = new Date().toISOString();

    for (const item of previousItems) {
      if (currentIds.has(item.id)) continue;
      if (dismissedIds.has(item.id)) continue;

      resolved.push({
        item,
        resolvedAt: now,
        resolution: getResolutionReasonForItem(item),
      });
    }

    return resolved;
  }

  async executeInboxAction(item: InboxItem, action: InboxAction): Promise<ApiResponse> {
    if (action === "dismiss") {
      await this.dismissItem(item.id);
      return { ok: true, status: 200 };
    }

    if (action === "open-in-chat") {
      return { ok: true, status: 200 };
    }

    if (!item.loopId) {
      return { ok: false, status: 400, error: "Item has no loop reference" };
    }

    const baseUrl = await this.resolveBaseUrl(item.environmentId);
    if (!baseUrl) {
      return { ok: false, status: 0, error: "Environment not found" };
    }

    switch (action) {
      case "run-now":
        return this.getApiService().request({
          baseUrl,
          path: `/api/loops/${encodeURIComponent(item.loopId)}/trigger`,
          method: "POST",
        });
      case "pause":
        return this.getApiService().request({
          baseUrl,
          path: `/api/loops/${encodeURIComponent(item.loopId)}/pause`,
          method: "POST",
        });
      case "resume":
        return this.getApiService().request({
          baseUrl,
          path: `/api/loops/${encodeURIComponent(item.loopId)}/resume`,
          method: "POST",
        });
      case "restart": {
        const resumeResult = await this.getApiService().request({
          baseUrl,
          path: `/api/loops/${encodeURIComponent(item.loopId)}/resume`,
          method: "POST",
        });
        if (!resumeResult.ok) return resumeResult;
        return this.getApiService().request({
          baseUrl,
          path: `/api/loops/${encodeURIComponent(item.loopId)}/trigger`,
          method: "POST",
        });
      }
      default:
        return { ok: false, status: 400, error: `Unknown action: ${action}` };
    }
  }
}
