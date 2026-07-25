import { useIntl } from "react-intl";
import type { AgentRuntime, RuntimeState } from "../../../shared/ipc";
import type { ReachabilityState } from "../types";

interface RuntimeOption {
  runtime: AgentRuntime;
  available: boolean;
  unavailableReason?: string;
}

interface AgentRuntimeSwitcherProps {
  value: AgentRuntime;
  instanceDefault: AgentRuntime;
  reachability: ReachabilityState | undefined;
  runtimeState: RuntimeState | undefined;
  onChange: (runtime: AgentRuntime) => void;
}

function deriveOptions(
  instanceDefault: AgentRuntime,
  reachability: ReachabilityState | undefined,
  runtimeState: RuntimeState | undefined,
): RuntimeOption[] {
  const runtimes: AgentRuntime[] = ["opencode", "claude"];

  return runtimes.map((runtime) => {
    if (reachability === "unreachable" || reachability === "reconnecting") {
      return { runtime, available: false, unavailableReason: "Instance unreachable" };
    }

    // Instance-default runtime is always considered available (trusted from provision).
    // Alternate may or may not be installed; we have no live signal for it, so
    // treat as potentially available unless overall runtimeState is "unavailable"
    // (which implies neither is installed).
    if (runtime === instanceDefault) {
      return { runtime, available: true };
    }

    if (runtimeState === "unavailable") {
      return { runtime, available: false, unavailableReason: "Not installed on this instance" };
    }

    return { runtime, available: true };
  });
}

export function AgentRuntimeSwitcher({
  value,
  instanceDefault,
  reachability,
  runtimeState,
  onChange,
}: AgentRuntimeSwitcherProps): React.ReactNode {
  const intl = useIntl();

  const options = deriveOptions(instanceDefault, reachability, runtimeState);

  return (
    <div className="segmented" role="radiogroup" aria-label={intl.formatMessage({ id: "agentSwitcher.label" })}>
      {options.map((opt) => {
        const label = intl.formatMessage({
          id: opt.runtime === "opencode" ? "agentSwitcher.opencode" : "agentSwitcher.claude",
        });
        const isActive = value === opt.runtime;
        const isDisabled = !opt.available;

        const title = isDisabled
          ? intl.formatMessage(
              { id: "agentSwitcher.unavailableReason" },
              { runtime: label, reason: opt.unavailableReason ?? "unavailable" },
            )
          : label;

        return (
          <button
            key={opt.runtime}
            className={`segment${isActive ? " active" : ""}`}
            role="radio"
            aria-checked={isActive}
            aria-disabled={isDisabled}
            disabled={isDisabled}
            title={title}
            onClick={() => {
              if (!isDisabled && !isActive) {
                onChange(opt.runtime);
              }
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
