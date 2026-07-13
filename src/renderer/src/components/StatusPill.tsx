import type { FleetItemStatus } from "../fleet-status";
import { PILL_LABELS, PILL_COLORS } from "../fleet-status";

export function StatusPill(props: {
  status: FleetItemStatus;
  size?: "sm" | "md";
}): React.ReactNode {
  const { status, size = "md" } = props;
  const label = PILL_LABELS[status];
  const color = PILL_COLORS[status];
  const cls = size === "sm" ? "status-pill status-pill-sm" : "status-pill";

  return (
    <span
      className={cls}
      style={{ background: `${color}22`, color, borderColor: `${color}44` }}
      title={label}
    >
      {label}
    </span>
  );
}

export function UnreadDot(props: { visible: boolean }): React.ReactNode {
  if (!props.visible) return null;
  return <span className="unread-dot" />;
}
