import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useIntl } from "react-intl";
import type { LoopMeta, EnvironmentHealth } from "../types";
import { runsToday } from "../format";
import { loopStatusToFleetItem } from "../fleet-mapping";
import { PILL_COLORS } from "../fleet-status";
import { Activity } from "lucide-react";

/** Heuristic: is this loop likely an agent loop? */
function isAgentLoop(loop: LoopMeta): boolean {
  const desc = (loop.description ?? "").toLowerCase();
  const cmd = loop.command.toLowerCase();
  const cmdRaw = loop.commandArgs.join(" ").toLowerCase();
  const agentKeywords = ["opencode", "claude", "copilot", "agent", "ai", "llm"];
  return agentKeywords.some(
    (kw) => desc.includes(kw) || cmd.includes(kw) || cmdRaw.includes(kw),
  );
}

interface LoopContributor {
  loopId: string;
  description: string;
  envName: string;
  runsToday: number;
  status: LoopMeta["status"];
  lastExitCode: number | null;
}

export function FleetActivityReadout(props: {
  perEnvLoops: Record<string, LoopMeta[]>;
  perEnvHealth: Record<string, EnvironmentHealth>;
  environments: { id: string; name: string }[];
}): React.ReactNode {
  const { perEnvLoops, perEnvHealth, environments } = props;
  const intl = useIntl();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Aggregate runs today across reachable instances
  const { totalRuns, contributors } = useMemo(() => {
    let total = 0;
    const items: LoopContributor[] = [];

    for (const env of environments) {
      const health = perEnvHealth[env.id];
      // Skip offline/unknown instances
      if (health === "offline" || health === "blocked" || health === "unknown") continue;

      const envLoops = perEnvLoops[env.id] ?? [];

      // Find agent loops; if none, use all loops as fallback
      const agentLoops = envLoops.filter(isAgentLoop);
      const targetLoops = agentLoops.length > 0 ? agentLoops : envLoops;

      for (const loop of targetLoops) {
        const count = runsToday(loop.runHistory);
        total += count;
        if (count > 0) {
          items.push({
            loopId: loop.id,
            description: loop.description?.trim() || loop.id,
            envName: env.name,
            runsToday: count,
            status: loop.status,
            lastExitCode: loop.lastExitCode,
          });
        }
      }
    }

    // Sort by runs descending, take top 10
    items.sort((a, b) => b.runsToday - a.runsToday);
    return { totalRuns: total, contributors: items.slice(0, 10) };
  }, [perEnvLoops, perEnvHealth, environments]);

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return;
    const handleClick = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [popoverOpen]);

  const handleToggle = useCallback(() => {
    setPopoverOpen((prev) => !prev);
  }, []);

  if (totalRuns === 0) return null;

  return (
    <div className="fleet-activity-readout" ref={containerRef}>
      <button
        className={`fleet-activity-chip${popoverOpen ? " active" : ""}`}
        onClick={handleToggle}
        title={intl.formatMessage({ id: "fleetActivity.tooltip" }, { count: totalRuns })}
      >
        <Activity size={12} />
        <span className="fleet-activity-count">
          {intl.formatMessage({ id: "fleetActivity.runsToday" }, { count: totalRuns })}
        </span>
      </button>
      {popoverOpen ? (
        <div className="fleet-activity-popover">
          <div className="fleet-activity-popover-header">
            <span className="overline">
              {intl.formatMessage({ id: "fleetActivity.topContributors" })}
            </span>
          </div>
          {contributors.length === 0 ? (
            <div className="fleet-activity-popover-empty">
              {intl.formatMessage({ id: "fleetActivity.noContributors" })}
            </div>
          ) : (
            <div className="fleet-activity-popover-list">
              {contributors.map((c) => {
                const fleetItem = loopStatusToFleetItem(c.status, c.lastExitCode);
                const color = PILL_COLORS[fleetItem];
                return (
                  <div key={`${c.envName}-${c.loopId}`} className="fleet-activity-row">
                    <span className="fleet-activity-dot" style={{ background: color }} />
                    <span className="fleet-activity-label">{c.description}</span>
                    <span className="fleet-activity-env">{c.envName}</span>
                    <span className="fleet-activity-runs">
                      {intl.formatMessage({ id: "fleetActivity.runCount" }, { count: c.runsToday })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
