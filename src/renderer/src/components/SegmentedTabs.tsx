import type { Section } from "../types";
import type { LucideIcon } from "lucide-react";
import { RotateCw, List, Folder } from "lucide-react";
import { useIntl } from "react-intl";

const SECTIONS: { key: Section; labelId: string; icon: LucideIcon }[] = [
  { key: "loops", labelId: "segmentedTabs.loops", icon: RotateCw },
  { key: "chat", labelId: "segmentedTabs.chat", icon: List },
  { key: "tasks", labelId: "segmentedTabs.tasks", icon: List },
  { key: "projects", labelId: "segmentedTabs.projects", icon: Folder },
];

/** Segmented pill switcher for the sections within an instance. */
export function SegmentedTabs(props: {
  active: Section;
  onChange: (section: Section) => void;
  disabled?: boolean;
}): React.ReactNode {
  const { active, onChange, disabled } = props;
  const intl = useIntl();

  return (
    <div className={`segmented${disabled ? " disabled" : ""}`}>
      {SECTIONS.map((section) => {
        const IconComp = section.icon;
        return (
          <button
            key={section.key}
            className={`segment${section.key === active ? " active" : ""}`}
            onClick={() => !disabled && onChange(section.key)}
          >
            <IconComp size={13} />
            <span>{intl.formatMessage({ id: section.labelId })}</span>
          </button>
        );
      })}
    </div>
  );
}
