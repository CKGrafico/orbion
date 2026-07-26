import { useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { EnvironmentHealth, LoopMeta } from "../types";
import type { ReachabilityState } from "../../../shared/ipc";
import { loopStatusToFleetItem } from "../fleet-mapping";
import type { FleetItemStatus } from "../fleet-status";
import { AlertTriangle, WifiOff } from "lucide-react";

interface FailedLoopDetail {
  envId: string;
  envName: string;
  projectId: string;
  loopId: string;
  loopDescription: string;
}

interface UnreachableEnvDetail {
  envId: string;
  envName: string;
}

export function FleetHealthFooter(props: {
  environments: { id: string; name: string }[];
  health: Record<string, EnvironmentHealth>;
  perEnvLoops: Record<string, LoopMeta[]>;
  /** Per-environment reachability (its own health layer, separate from loop status). */
  reachability?: Record<string, ReachabilityState>;
  onNavigateToLoop: (envId: string, loopId: string) => void;
  onNavigateToProject: (envId: string, projectId: string) => void;
  onNavigateToInbox: () => void;
  onSelectEnvironment: (envId: string) => void;
}): React.ReactNode {
  const {
    environments,
    health,
    perEnvLoops,
    onNavigateToLoop,
    onNavigateToProject,
    onNavigateToInbox,
    onSelectEnvironment,
    reachability,
  } = props;
  const { t } = useTranslation();

  const {
    instanceCount,
    connectedCount,
    failedLoopDetails,
    unreachableEnvDetails,
  } = useMemo(() => {
    let connected = 0;
    const failed: FailedLoopDetail[] = [];
    const unreachable: UnreachableEnvDetail[] = [];

    for (const env of environments) {
      const h = health[env.id] ?? "unknown";
      const r = reachability?.[env.id];

      if (h === "ok") {
        connected++;
      } else if (h === "offline" || h === "blocked" || h === "unknown") {
        unreachable.push({ envId: env.id, envName: env.name });
      }

      // Only count failures from reachable environments.
      // Loops on unreachable/reconnecting instances are "unknown" (greyed),
      // NOT "failed" — a dropped tunnel never reads as your work failing.
      const isReachable = r === "connected" || r === undefined;
      if ((h === "ok" || h === "connecting" || h === "backoff") && isReachable) {
        const envLoops = perEnvLoops[env.id] ?? [];

        for (const loop of envLoops) {
          const fleetItem: FleetItemStatus = loopStatusToFleetItem(
            loop.status,
            loop.lastExitCode,
            r,
          );
          if (fleetItem === "failed") {
            const projectId = loop.projectId ?? "default";
            failed.push({
              envId: env.id,
              envName: env.name,
              projectId,
              loopId: loop.id,
              loopDescription: loop.description?.trim() || loop.id,
            });
          }
        }
      }
    }

    return {
      instanceCount: environments.length,
      connectedCount: connected,
      failedLoopDetails: failed,
      unreachableEnvDetails: unreachable,
    };
  }, [environments, health, perEnvLoops, reachability]);

  const handleFailureClick = useCallback(() => {
    if (failedLoopDetails.length === 0) return;

    if (failedLoopDetails.length === 1) {
      // Single failing loop — jump straight to it
      const detail = failedLoopDetails[0];
      onNavigateToLoop(detail.envId, detail.loopId);
      return;
    }

    // Multiple failures: check if they're all in the same project
    const uniqueProjectKeys = new Set<string>();
    for (const d of failedLoopDetails) {
      uniqueProjectKeys.add(`${d.envId}::${d.projectId}`);
    }

    if (uniqueProjectKeys.size === 1) {
      // All failures in one project — expand that project
      const detail = failedLoopDetails[0];
      onNavigateToProject(detail.envId, detail.projectId);
    } else {
      // Multiple projects/environments — go to inbox
      onNavigateToInbox();
    }
  }, [failedLoopDetails, onNavigateToLoop, onNavigateToProject, onNavigateToInbox]);

  const handleUnreachableClick = useCallback(() => {
    if (unreachableEnvDetails.length === 0) return;
    // Select the first unreachable environment
    onSelectEnvironment(unreachableEnvDetails[0].envId);
  }, [unreachableEnvDetails, onSelectEnvironment]);

  // Nothing to show if no environments at all
  if (instanceCount === 0) return null;

  const failedCount = failedLoopDetails.length;
  const unreachableCount = unreachableEnvDetails.length;

  return (
    <div className="fleet-health-footer">
      <span className="fleet-health-summary">
        {t("fleetHealth.instancesConnected", { total: instanceCount, connected: connectedCount })}
      </span>

      {failedCount > 0 ? (
        <button
          className="fleet-health-pill fleet-health-pill-danger"
          onClick={handleFailureClick}
          title={
            failedCount === 1
              ? failedLoopDetails[0].loopDescription
              : t("fleetHealth.loopsFailing", { count: failedCount })
          }
        >
          <AlertTriangle size={11} />
          <span>
            {failedCount === 1
              ? t("fleetHealth.loopFailing")
              : t("fleetHealth.loopsFailing", { count: failedCount })
            }
          </span>
        </button>
      ) : null}

      {unreachableCount > 0 ? (
        <button
          className="fleet-health-pill fleet-health-pill-unreachable"
          onClick={handleUnreachableClick}
          title={
            unreachableCount === 1
              ? unreachableEnvDetails[0].envName
              : t("fleetHealth.unreachablePlural", { count: unreachableCount })
          }
        >
          <WifiOff size={11} />
          <span>
            {unreachableCount === 1
              ? t("fleetHealth.unreachable")
              : t("fleetHealth.unreachablePlural", { count: unreachableCount })
            }
          </span>
        </button>
      ) : null}
    </div>
  );
}
