import { injectable } from "inversify-hooks";
import type { IInboxService, InboxBuildParams, IApiService, IConfigService } from "../interfaces";
import type { InboxItem, InboxAction, InboxQueryResult, ResolvedInboxItem, InboxItemResolutionReason, ApiResponse } from "../../../../shared/ipc";
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

/**
 * Determine the available inline actions for an inbox item based on its kind
 * and the loop's current status.
 *
 * Action mapping per the issue acceptance criteria:
 * - Failure (failed-loop): Run now, Pause, Open in chat
 * - Finished (finished-loop): Dismiss, Restart
 * - Watch (breach): Dismiss, Open in chat
 * - Offline (instance-offline, prolonged-offline): Dismiss only
 * - Pending-approval / Awaiting-input: Open in chat
 */
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
    default:
      return ["dismiss"];
  }
}

/**
 * Build inbox items from live fleet data.
 *
 * Items are derived (not persisted): they are computed on every call from
 * perEnvLoops, breaches, and health status. The only persisted state is
 * the set of dismissed item IDs.
 *
 * Prolonged-offline items (kind "prolonged-offline") appear only when
 * the main-process OutageTracker escalates an outage. They self-resolve
 * when the instance reconnects (the OutageTracker fires onResolve, which
 * clears the entry from escalatedOutages). Short outages under the
 * threshold (~10 min) never create an inbox item.
 */
function deriveItems(params: InboxBuildParams): InboxItem[] {
  const { perEnvLoops, perEnvHealth, environments, breaches, dismissedIds, escalatedOutages } = params;
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

  // 2. Loop-derived items across reachable instances
  for (const env of environments) {
    const health = perEnvHealth[env.id];

    // Prolonged-offline takes precedence over instance-offline
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
      // Skip loop scanning for unreachable instances
      continue;
    }

    // Short outages (under threshold) show as instance-offline
    // — but only if they're actually showing offline in the health
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
      // Finished loop: hit max-runs
      const isFinished = loop.maxRuns !== null && loop.runCount >= loop.maxRuns;
      // Failed loop: last run exited non-zero
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

  // Sort by occurredAt descending
  items.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  return items;
}

/**
 * Answer a natural-language question about the fleet.
 *
 * This is a local, deterministic query engine (no LLM). It parses common
 * question patterns and formats a structured markdown answer with links.
 */
function answerFleetQuery(
  question: string,
  items: InboxItem[],
  params: InboxBuildParams,
): InboxQueryResult {
  const q = question.toLowerCase().trim();
  const references: InboxItem[] = [];

  // "what needs me" / "what needs attention" / "morning"
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

  // "failed" / "failures" / "errors"
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

  // "offline" / "disconnected" / "unreachable"
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

  // "finished" / "completed" / "done" (loops that hit max-runs)
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

  // "breaches" / "budget" / "over budget"
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

  // "watches" / "watch" / "notifications" / "alerts"
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

  // Fallback: general summary
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
    return container.resolve<IConfigService>(cid.IConfigService as unknown as string);
  }

  private getApiService(): IApiService {
    return container.resolve<IApiService>(cid.IApiService as unknown as string);
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
    // Dismissed IDs are tracked via inbox:dismissItem IPC
    // We don't have a dedicated "get dismissed IDs" endpoint,
    // so we piggyback on the main process config store.
    // For now, the renderer tracks dismissed IDs locally.
    return [];
  }

  async dismissItem(itemId: string): Promise<void> {
    if (!window.api) return;
    await window.api.inbox.dismissItem(itemId);
  }

  buildItems(params: InboxBuildParams): InboxItem[] {
    return deriveItems(params);
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
      // Skip if still active in current set
      if (currentIds.has(item.id)) continue;
      // Skip if the user explicitly dismissed it (that's not auto-resolution)
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
    // Dismiss is handled locally (no API call to loop-task)
    if (action === "dismiss") {
      await this.dismissItem(item.id);
      return { ok: true, status: 200 };
    }

    // Open-in-chat is a navigation action, not an API call
    // The caller handles it by navigating; we just confirm
    if (action === "open-in-chat") {
      return { ok: true, status: 200 };
    }

    // All other actions require a loop ID and environment
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
        // Restart = resume a stopped/finished loop, then trigger it
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
