import type { RunSegment } from "./log-types";
import { RunHeaderRow } from "./LogRowRenderer";
import { LogRowRenderer } from "./LogRowRenderer";

export function RunCard({
  segment,
  onToggle,
}: {
  segment: RunSegment;
  onToggle: (runNumber: number) => void;
}): React.ReactNode {
  const headerRow = segment.rows.find((r) => r.kind === "run-header");
  const contentRows = segment.rows.filter((r) => r.kind !== "run-header");

  return (
    <div className={`run-card ${segment.expanded ? "run-card-expanded" : "run-card-collapsed"}`}>
      {headerRow && headerRow.kind === "run-header" && (
        <RunHeaderRow
          row={headerRow}
          expanded={segment.expanded}
          onToggle={() => onToggle(segment.runNumber)}
        />
      )}
      {segment.expanded && (
        <div className="run-card-content">
          {contentRows.map((row) => (
            <LogRowRenderer key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
