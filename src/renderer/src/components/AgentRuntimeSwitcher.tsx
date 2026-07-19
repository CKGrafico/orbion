import { useIntl } from "react-intl";
import type { AgentRuntime, RuntimeState } from "../../../shared/ipc";
import type { ReachabilityState } from "../types";

interface RuntimeOption {
  runtime: AgentRuntime;
  /** Whether this runtime is available on the home instance. */
  available: boolean;
  /** Human-readable reason when unavailable. */
  unavailableReason?: string;
}

interface AgentRuntimeSwitcherProps {
  /** The currently selected runtime (from the session). */
  value: AgentRuntime;
  /** The instance's default runtime (from the environment). */
  instanceDefault: AgentRuntime;
  /** Reachability state of the home instance. */
  reachability: ReachabilityState | undefined;
  /** Runtime state of the environment (coarse availability). */
  runtimeState: RuntimeState | undefined;
  /** Called when the user picks a different runtime. */
  onChange: (runtime: AgentRuntime) => void;
}

/**
 * Derive the availability and reason for each runtime option given
 * the current health signals for the home instance.
 */
function deriveOptions(
  instanceDefault: AgentRuntime,
  reachability: ReachabilityState | undefined,
  runtimeState: RuntimeState | undefined,
): RuntimeOption[] {
  const runtimes: AgentRuntime[] = ["opencode", "claude"];

  return runtimes.map((runtime) => {
    // If the instance is unreachable, all runtimes are unavailable
    if (reachability === "unreachable" || reachability === "reconnecting") {
      return { runtime, available: false, unavailableReason: "Instance unreachable" };
    }

    // The instance-default runtime is always considered available (we trust
    // the provision step). The alternate may or may not be installed.
    if (runtime === instanceDefault) {
      return { runtime, available: true };
    }

    // Alternate runtime: check runtimeState
    // runtimeState reflects the *default* runtime on the env; for the alternate
    // we have no live signal, so we treat it as potentially available unless
    // the overall runtimeState is "unavailable" (which implies neither is
    // installed). This is conservative but honest.
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
