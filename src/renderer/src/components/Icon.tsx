// Minimal inline SVG icon set (16px grid, 1.5 stroke, currentColor) so the
// chrome uses real icons instead of unicode glyphs.

const PATHS: Record<string, React.ReactNode> = {
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  search: (
    <>
      <circle cx="7.25" cy="7.25" r="4.25" />
      <path d="m13 13-2.7-2.7" />
    </>
  ),
  panelLeft: (
    <>
      <rect x="2" y="3" width="12" height="10" rx="2" />
      <path d="M6.5 3v10" />
    </>
  ),
  arrowLeft: <path d="M10.5 3.5 6 8l4.5 4.5" />,
  arrowUp: <path d="M8 12.5v-9M4 7l4-3.5L12 7" />,
  rotate: (
    <>
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
      <path d="M13.5 2.5v3h-3" />
    </>
  ),
  list: <path d="M5.5 4.5h8M5.5 8h8M5.5 11.5h8M2.5 4.5h.01M2.5 8h.01M2.5 11.5h.01" />,
  folder: <path d="M2.5 4.5A1.5 1.5 0 0 1 4 3h2.6l1.4 1.7H12a1.5 1.5 0 0 1 1.5 1.5v5.3A1.5 1.5 0 0 1 12 13H4a1.5 1.5 0 0 1-1.5-1.5v-7Z" />,
  x: <path d="m4.5 4.5 7 7m0-7-7 7" />,
  copy: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
    </>
  ),
  chevronDown: <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />,
  terminal: (
    <>
      <rect x="2" y="3" width="12" height="10" rx="2" />
      <path d="M5 7l2.5 2L5 11" />
      <path d="M9 11h2.5" />
    </>
  ),
  check: <path d="M4 8.5l3 3 5.5-7" />,
};

export type IconName = keyof typeof PATHS;

export function Icon(props: { name: IconName; size?: number; strokeWidth?: number }): React.ReactNode {
  const { name, size = 16, strokeWidth = 1.5 } = props;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
