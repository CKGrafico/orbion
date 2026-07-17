import { useIntl } from "react-intl";
import { OrbionMark } from "./OrbionMark";

/**
 * Cold-open empty state: shown when no instances/environments are configured.
 * A single centered card that teaches the user what Orbion is and
 * launches the add-instance wizard.
 */
export function ColdOpen({ onAddVm }: { onAddVm: () => void }): React.ReactNode {
  const intl = useIntl();

  return (
    <div className="cold-open">
      <OrbionMark size={40} />
      <h2 className="cold-open-headline">
        {intl.formatMessage({ id: "coldOpen.headline" })}
      </h2>
      <p className="cold-open-copy">
        {intl.formatMessage({ id: "coldOpen.copy" })}
      </p>
      <button className="btn primary cold-open-btn" onClick={onAddVm}>
        {intl.formatMessage({ id: "coldOpen.addFirstMachine" })}
      </button>
    </div>
  );
}
