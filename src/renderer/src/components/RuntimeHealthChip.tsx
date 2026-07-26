import { useTranslation } from "react-i18next";
import type { Environment, EnvironmentHealth, ReachabilityState, RuntimeState } from "../types";
import type { OpenCodeConnectionStatus } from "../../../shared/ipc";
import { deriveRuntimeHealth, RUNTIME_HEALTH_COLORS, type RuntimeHealthState } from "../runtime-health";

const STATE_LABEL_KEYS: Record<RuntimeHealthState, string> = {
  ok: "runtimeHealth.ok",
  "not-running": "runtimeHealth.notRunning",
  "not-installed": "runtimeHealth.notInstalled",
  "auth-problem": "runtimeHealth.authProblem",
  unreachable: "runtimeHealth.unreachable",
};

export function RuntimeHealthChip(props: {
  environment: Environment;
  health: EnvironmentHealth;
  reachability: ReachabilityState | undefined;
  openCodeStatus: OpenCodeConnectionStatus | undefined;
  runtimeState: RuntimeState | undefined;
}): React.ReactNode {
  const { environment, health, reachability, openCodeStatus, runtimeState } = props;
  const { t } = useTranslation();

  const info = deriveRuntimeHealth(environment, health, reachability, openCodeStatus, runtimeState);
  const color = RUNTIME_HEALTH_COLORS[info.state];
  const label = t(STATE_LABEL_KEYS[info.state]);

  return (
    <span
      className="chip"
      title={info.reason}
      style={{ display: "flex", alignItems: "center", gap: 5 }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}
