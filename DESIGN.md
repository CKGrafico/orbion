---
name: Orbion
description: >-
  Dark, terminal-adjacent monitoring UI for loop-task daemons. Navy panels
  floating on a near-black frame, hairline borders, a single lime-green accent,
  and a monospace-forward information density inspired by developer tooling and
  Hack-The-Box-style dashboards.
themes:
  default:
    color:
      # Backgrounds — layered navy, darkest frame to lightest elevated surface
      bg_frame: "#0d141f"        # outermost app background (behind panels)
      bg_panel: "#141d2b"        # main content panel
      bg_sidebar: "#1a2332"      # sidebar panel
      bg_elevated: "#1e2839"     # cards, modals, meta grids
      bg_input: "#0f1826"        # inputs, prompt box, segment track
      bg_hover: "#202c40"        # hover state fill
      bg_active: "#26344c"       # selected/active fill, chips
      bg_log: "#0b111b"          # log viewer (darkest, terminal-like)

      # Borders
      border: "#2a3a54"          # standard hairline border
      border_subtle: "#1e2a3e"   # low-contrast dividers, panel edges

      # Text
      text_primary: "#e8edf6"    # headings, primary content
      text_secondary: "#a4b1cd"  # body, labels
      text_muted: "#6a7791"      # meta, placeholders, timestamps

      # Accent — lime green, used sparingly for primary action + "on" states
      accent: "#9fef00"
      accent_hover: "#b4ff3a"
      accent_ink: "#0d141f"      # text/icon color on accent fills
      accent_task: "#cf8dfb"     # secondary accent (tasks / violet)
      chip_warm: "#ffcc5c"       # warm highlight for prompt chip

      # Semantic / status
      success: "#9fef00"
      danger: "#ff8484"
      warning: "#ffcc5c"

      # Loop status palette (matched to the loop-task TUI)
      status_running: "#9fef00"
      status_waiting: "#5cb2ff"
      status_paused: "#ffcc5c"
      status_idle: "#a4b1cd"
      status_stopped: "#ff8484"

      selection: "rgba(217, 119, 87, 0.35)"

typography:
  font_family:
    ui: '"Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, "Inter", sans-serif'
    mono: '"Cascadia Code", "Consolas", "JetBrains Mono", monospace'
  base_size: "14px"
  base_line_height: 1.45
  smoothing: antialiased
  scale:
    label_upper: { size: "11px", weight: 400, transform: uppercase, letter_spacing: "0.4px" }
    meta: { size: "12px", weight: 400 }
    chip: { size: "11.5px", weight: 400 }
    body: { size: "13px", weight: 400 }
    body_row: { size: "13.5px", weight: 400 }
    input: { size: "14px", weight: 400 }
    title_view: { size: "16px", weight: 600 }
    title_main: { size: "14px", weight: 700 }
    heading_modal: { size: "15px", weight: 600 }
  code:
    size: "12px"
    line_height: 1.55

spacing:
  gutter: "8px"      # gap between panels / app padding
  scale: ["2px", "4px", "6px", "8px", "10px", "12px", "14px", "16px", "18px", "22px", "26px"]
  content_padding: "18px 26px 130px"   # extra bottom padding clears the prompt bar
  panel_content_max_width: "920px"

radii:
  sm: "6px"    # chips, buttons, small controls
  md: "8px"    # rows, inputs, meta grid, log viewer
  lg: "12px"   # panels, modal
  xl: "14px"   # prompt box
  pill: "999px" # segmented switcher
  dot: "50%"   # status dots, avatar

elevation:
  panel: "1px solid border_subtle (no shadow; separation by fill + hairline)"
  prompt_box: "0 10px 32px rgba(0, 0, 0, 0.4)"
  modal: "0 16px 48px rgba(0, 0, 0, 0.5)"
  modal_backdrop: "rgba(0, 0, 0, 0.55)"

motion:
  philosophy: >-
    Near-static. State changes are instant fills/opacity swaps with no explicit
    transitions defined. Timing lives in behavior, not CSS: hover reveals
    (remove buttons), debounced saves (~500ms), transient confirmations
    (~1.5s "Copied ✓").
  transitions: none-defined

layout:
  frame: "vertical flex — custom titlebar (42px) above a two-column body"
  titlebar_height: "42px"
  sidebar_width: "240px"
  structure: >-
    Draggable custom titlebar with icon buttons (toggle sidebar, search, back)
    and brand. Body = floating sidebar panel + main panel, separated by an 8px
    gutter, each with rounded corners and hairline borders over the dark frame.
  chrome: >-
    Frameless window (titleBarStyle hidden) with a Windows titleBarOverlay tinted
    to match the frame; the titlebar is -webkit-app-region: drag with no-drag
    controls.

components:
  segmented_tabs: "pill track (bg_input) with active segment lifted to bg_active, rounded 999px"
  status_dot: "8px circle, color from status palette"
  chip: "bg_active pill, radius sm; .mono variant uses monospace and truncates"
  prompt_bar: "floating rounded input box pinned to the bottom of the main panel, used as the section filter"
  log_viewer: "monospace on the darkest surface (bg_log); lines colorized by classification (run headers warm, exit 0 green, non-zero exit red)"
  modal: "centered card on a dimmed backdrop, 440px wide"
  scrollbar: "10px, thumb bg_active with transparent track (webkit)"
---

# Orbion — Design System

## Design Intent

Orbion looks and feels like a **developer instrument**, not a consumer
app. It borrows the visual language of terminal dashboards and security tooling:
a very dark navy field, crisp hairline borders, dense-but-legible typography,
and a single electric lime-green accent (`#9fef00`) that appears only where it
earns attention — the primary action, the "following" state, and running loops.
Everything else is quiet.

## Look & Feel

- **Layered darkness.** Depth is communicated by fill, not shadow. Five stepped
  navy surfaces (`bg_frame` → `bg_input` → `bg_panel` → `bg_sidebar` →
  `bg_elevated`) plus a near-black log surface (`bg_log`) create hierarchy.
  Shadows appear only on genuinely floating elements (the prompt box and modals).
- **Floating rounded panels.** The sidebar and main content live as separate
  rounded panels (`radius lg`) over the darker frame, divided by a small gutter.
  This "picture-in-picture" framing gives the app its distinctive silhouette.
- **Hairline structure.** Separation relies on 1px `border_subtle` /`border`
  lines rather than heavy dividers or drop shadows.
- **One accent, used sparingly.** Lime green is the identity color but is
  rationed: primary buttons, the active follow toggle, running-loop status, and
  the user avatar. A secondary violet (`accent_task`) and a warm amber
  (`chip_warm` / `warning`) provide small, semantic pops.

## Color

The palette is monochromatic navy with functional accents. Text uses a
three-step ramp (`text_primary` / `text_secondary` / `text_muted`) for clear
hierarchy against the dark surfaces. Status is expressed through a fixed palette
deliberately matched to the loop-task TUI, so the desktop app and the terminal
read as the same product: **running** = lime, **waiting** = blue, **paused** =
amber, **idle** = muted gray, **stopped** = red.

## Typography

The UI is set in the platform UI stack (Segoe UI Variable → system fallbacks) at
a compact 14px base with tight 1.45 line-height for information density.
**Monospace** (Cascadia Code / Consolas) carries anything machine-oriented:
hostnames, commands, IDs, and the log viewer. Uppercase micro-labels with
letter-spacing tag metadata fields. Weight, not size, does most of the
hierarchy work (600–700 for titles over a 13–16px range).

## Spacing, Radii & Density

Spacing follows a small even-step scale built on an 8px gutter. Corner radii
climb with element importance — 6px for chips/buttons up to 14px for the prompt
box and a full pill for the segmented switcher. The main content column is
capped near 920px and carries generous bottom padding so content never hides
behind the floating filter bar.

## Motion

Motion is intentionally minimal. There are no declared CSS transitions; state
changes read as immediate. The sense of "aliveness" comes from behavior instead:
hover-revealed controls, autoscrolling live logs, debounced window-bounds
persistence, and brief inline confirmations. The result feels fast and utilitarian.

## Voice in the UI

Terse and technical. Labels are short ("Loops", "Tasks", "updated 3m ago"),
placeholders are lowercase ("Filter loops…"), and glyph icons (`↻ ≔ ▣ ⌕ ←`)
stand in for words where meaning is obvious — reinforcing the compact, tooling
aesthetic.

<!-- Last updated: 2026-07-04T23:02:28Z -->
