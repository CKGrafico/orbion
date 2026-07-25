import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Environment, EnvironmentHealth, LoopMeta, Project, ReachabilityState } from "../types";
import { Star, Settings } from "lucide-react";

/** One instance that hosts the current session's project. */
interface InstanceOption {
  env: Environment;
  project: Project | undefined;
  workingDirectory: string | undefined;
  loopCount: number;
  isHome: boolean;
  health: EnvironmentHealth;
  reachability: ReachabilityState | undefined;
}

interface InstanceSelectorProps {
  projectName: string;
  environments: Environment[];
  perEnvProjects: Record<string, Project[]>;
  perEnvLoops: Record<string, LoopMeta[]>;
  health: Record<string, EnvironmentHealth>;
  reachability: Record<string, ReachabilityState>;
  currentEnvironmentId: string;
  mainVmId: string | null;
  onChange: (environmentId: string, workingDirectory: string | undefined) => void;
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
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const options = useMemo<InstanceOption[]>(() => {
    const result: InstanceOption[] = [];

    for (const env of environments) {
      const envProjects = perEnvProjects[env.id] ?? [];
      const project = envProjects.find((p) => p.name === projectName);

      if (!project) continue;

      const envLoops = perEnvLoops[env.id] ?? [];
      const projectLoopCount = envLoops.filter(
        (l) => (l.projectId ?? "default") === project.id,
      ).length;

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

  const currentOption = options.find((o) => o.isHome);
  const triggerLabel = currentOption?.env.name ?? t("instanceSelector.noInstance");

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
        title={t("instanceSelector.tooltip", { project: projectName })}
      >
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: triggerDotColor, flexShrink: 0 }} />
        <span className="instance-selector-trigger-label">{triggerLabel}</span>
        <span className="instance-selector-arrow">{open ? "\u25B2" : "\u25BC"}</span>
      </button>

      {open ? (
        <div className="instance-selector-dropdown">
          <div className="instance-selector-dropdown-header">
            {t("instanceSelector.header", { project: projectName })}
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
                  {t(
                    "instanceSelector.loopCount",
                    { count: option.loopCount },
                  )}
                </span>
                {onOpenSettings ? (
                  <span
                    className="instance-selector-gear"
                    role="button"
                    tabIndex={0}
                    title={t("instanceSelector.settingsTooltip")}
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
