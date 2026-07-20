import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIntl } from "react-intl";
import type { Environment, EnvironmentHealth, LoopMeta, Project, ReachabilityState } from "../types";
import { Star, Settings } from "lucide-react";

/** One instance that hosts the current session's project. */
interface InstanceOption {
  /** The environment/instance. */
  env: Environment;
  /** The project on this instance matching the session's projectName. */
  project: Project | undefined;
  /** The project's working directory on this instance (derived from loop cwd). */
  workingDirectory: string | undefined;
  /** Number of loops in this project on this instance. */
  loopCount: number;
  /** Whether this is the session's current home instance. */
  isHome: boolean;
  /** Connection health of this instance. */
  health: EnvironmentHealth;
  /** Reachability state (its own health layer, separate from loop status). */
  reachability: ReachabilityState | undefined;
}

interface InstanceSelectorProps {
  /** The project name to filter instances by. */
  projectName: string;
  /** All known environments. */
  environments: Environment[];
  /** Per-environment projects (keyed by environmentId). */
  perEnvProjects: Record<string, Project[]>;
  /** Per-environment loops (keyed by environmentId). */
  perEnvLoops: Record<string, LoopMeta[]>;
  /** Per-environment health. */
  health: Record<string, EnvironmentHealth>;
  /** Per-environment reachability state. */
  reachability: Record<string, ReachabilityState>;
  /** The currently selected (home) environment ID. */
  currentEnvironmentId: string;
  /** ID of the main-VM environment (for star marker). */
  mainVmId: string | null;
  /** Called when the user picks a different instance. */
  onChange: (environmentId: string, workingDirectory: string | undefined) => void;
  /** Called when the user clicks the gear icon to open instance settings. */
  onOpenSettings?: (environmentId: string) => void;
}

export function InstanceSelector({
  projectName,
  environments,
  perEnvProjects,
  perEnvLoops,
  health,
  reachability,
  currentEnvironmentId,
  mainVmId,
  onChange,
  onOpenSettings,
}: InstanceSelectorProps): React.ReactNode {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Build the filtered instance list: only instances that have this project
  const options = useMemo<InstanceOption[]>(() => {
    const result: InstanceOption[] = [];

    for (const env of environments) {
      const envProjects = perEnvProjects[env.id] ?? [];
      // Find a project on this instance matching the session's projectName
      const project = envProjects.find((p) => p.name === projectName);

      if (!project) continue;

      const envLoops = perEnvLoops[env.id] ?? [];
      // Count loops belonging to this project
      const projectLoopCount = envLoops.filter(
        (l) => (l.projectId ?? "default") === project.id,
      ).length;

      // Derive working directory from the first loop's cwd in this project
      const firstProjectLoop = envLoops.find(
        (l) => (l.projectId ?? "default") === project.id,
      );

      result.push({
        env,
        project,
        workingDirectory: firstProjectLoop?.cwd,
        loopCount: projectLoopCount,
        isHome: env.id === currentEnvironmentId,
        health: health[env.id] ?? "unknown",
        reachability: reachability[env.id],
      });
    }

    return result;
  }, [environments, perEnvProjects, perEnvLoops, health, reachability, projectName, currentEnvironmentId]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent): void => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleSelect = useCallback(
    (option: InstanceOption) => {
      if (option.env.id !== currentEnvironmentId) {
        onChange(option.env.id, option.workingDirectory);
      }
      setOpen(false);
    },
    [currentEnvironmentId, onChange],
  );

  // If only one instance has this project, no need for a dropdown (just show name)
  // But always show it to indicate which instance is active
  const currentOption = options.find((o) => o.isHome);
  const triggerLabel = currentOption?.env.name ?? intl.formatMessage({ id: "instanceSelector.noInstance" });

  // Health dot color for the trigger
  const triggerHealth = currentOption?.health ?? "unknown";
  const triggerDotColor =
    triggerHealth === "ok" ? "var(--health-ok)"
    : triggerHealth === "connecting" ? "var(--health-connecting)"
    : triggerHealth === "backoff" ? "var(--health-backoff)"
    : triggerHealth === "blocked" ? "var(--health-blocked)"
    : "var(--health-offline)";

  if (options.length === 0) {
    return null;
  }

  return (
    <div className="instance-selector-wrapper" ref={wrapperRef}>
      <button
        className="instance-selector-trigger"
        onClick={() => setOpen((v) => !v)}
        title={intl.formatMessage({ id: "instanceSelector.tooltip" }, { project: projectName })}
      >
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: triggerDotColor, flexShrink: 0 }} />
        <span className="instance-selector-trigger-label">{triggerLabel}</span>
        <span className="instance-selector-arrow">{open ? "\u25B2" : "\u25BC"}</span>
      </button>

      {open ? (
        <div className="instance-selector-dropdown">
          <div className="instance-selector-dropdown-header">
            {intl.formatMessage({ id: "instanceSelector.header" }, { project: projectName })}
          </div>
          {options.map((option) => {
            const dotColor =
              option.health === "ok" ? "var(--health-ok)"
              : option.health === "connecting" ? "var(--health-connecting)"
              : option.health === "backoff" ? "var(--health-backoff)"
              : option.health === "blocked" ? "var(--health-blocked)"
              : "var(--health-offline)";
            const isMainVm = option.env.id === mainVmId;
            const isUnreachable = option.reachability === "unreachable" || option.reachability === "reconnecting";

            return (
              <button
                key={option.env.id}
                className={`instance-selector-option${option.isHome ? " selected" : ""}${isUnreachable ? " unreachable" : ""}`}
                onClick={() => handleSelect(option)}
                title={option.env.name}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                <span className="instance-selector-option-name">
                  {option.env.name}
                  {isMainVm ? (
                    <Star
                      size={9}
                      fill="currentColor"
                      style={{ marginLeft: 3, color: "var(--chip-warm)", verticalAlign: "middle" }}
                    />
                  ) : null}
                </span>
                {option.workingDirectory ? (
                  <span className="instance-selector-option-path" title={option.workingDirectory}>
                    {option.workingDirectory}
                  </span>
                ) : null}
                <span className="instance-selector-option-loops">
                  {intl.formatMessage(
                    { id: "instanceSelector.loopCount" },
                    { count: option.loopCount },
                  )}
                </span>
                {onOpenSettings ? (
                  <span
                    className="instance-selector-gear"
                    role="button"
                    tabIndex={0}
                    title={intl.formatMessage({ id: "instanceSelector.settingsTooltip" })}
                    onClick={(e) => { e.stopPropagation(); onOpenSettings(option.env.id); setOpen(false); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onOpenSettings(option.env.id); setOpen(false); } }}
                  >
                    <Settings size={13} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
