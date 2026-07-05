import type { Section } from "../types";
import { Icon, type IconName } from "./Icon";

const SECTIONS: { key: Section; label: string; icon: IconName }[] = [
  { key: "loops", label: "Loops", icon: "rotate" },
  { key: "tasks", label: "Tasks", icon: "list" },
  { key: "projects", label: "Projects", icon: "folder" },
];

/** Segmented pill switcher for the sections within an instance. */
export function SegmentedTabs(props: {
  active: Section;
  onChange: (section: Section) => void;
  disabled?: boolean;
}): React.ReactNode {
  const { active, onChange, disabled } = props;

  return (
    <div className={`segmented${disabled ? " disabled" : ""}`}>
      {SECTIONS.map((section) => (
        <button
          key={section.key}
          className={`segment${section.key === active ? " active" : ""}`}
          onClick={() => !disabled && onChange(section.key)}
        >
          <Icon name={section.icon} size={13} />
          <span>{section.label}</span>
        </button>
      ))}
    </div>
  );
}
