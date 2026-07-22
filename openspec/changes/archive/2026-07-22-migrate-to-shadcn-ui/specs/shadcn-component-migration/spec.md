## ADDED Requirements

### Requirement: Sidebar context menu uses shadcn DropdownMenu
The Sidebar's per-session menu SHALL be implemented with `<DropdownMenu>`, `<DropdownMenuItem>`, `<DropdownMenuSeparator>`, `<DropdownMenuLabel>`, and `<DropdownMenuSub>` from shadcn/ui, replacing the custom `sidebar-context-menu` + `sidebar-context-menu-backdrop` CSS pattern.

#### Scenario: Session menu opens from three-dot button
- **WHEN** user clicks the three-dot button on a sidebar session
- **THEN** a `<DropdownMenu>` opens with items: pin/unpin, rename, delete, move up/down, move to project (submenu)
- **AND** the menu renders with Orbion's dark navy/elevated surface background and lime accent on the active item

#### Scenario: Session menu supports keyboard navigation
- **WHEN** the dropdown menu is open
- **THEN** arrow keys navigate between items, Enter selects, Escape closes

### Requirement: FleetActivityReadout popover uses shadcn Popover
The FleetActivityReadout's floating info panel SHALL be implemented with `<Popover>` from shadcn/ui, replacing the custom `fleet-activity-popover` CSS pattern.

#### Scenario: Popover opens on trigger click
- **WHEN** user clicks the FleetActivityReadout trigger
- **THEN** a `<Popover>` opens showing the fleet activity details
- **AND** clicking outside the popover closes it

### Requirement: Confirmation dialogs use shadcn Dialog/AlertDialog
All `modal-backdrop` + `modal` confirmation patterns in App.tsx (confirm-remove, confirm-unpersist), StaleConfigWarning, and PickMainVmModal SHALL be implemented with `<Dialog>` or `<AlertDialog>` from shadcn/ui.

#### Scenario: Remove instance confirmation
- **WHEN** user triggers remove-instance action
- **THEN** an `<AlertDialog>` opens with confirm/cancel buttons
- **AND** the dialog renders with Orbion's dark navy panel background and hairline border

#### Scenario: Stale config warning
- **WHEN** a stale config overwrite is detected
- **THEN** a `<Dialog>` opens with the warning content and action buttons
- **AND** the dialog matches Orbion's modal visual style (centered, elevated surface, backdrop dim)

### Requirement: Wizard and modal dialogs use shadcn Dialog
The AddVmWizard, RestoreOffer, and ReviewModeOverlay SHALL be implemented with `<Dialog>` from shadcn/ui. The wizard uses a wide variant; the review overlay uses a full-screen variant.

#### Scenario: AddVmWizard opens as a wide dialog
- **WHEN** user triggers the add-VM flow
- **THEN** a `<Dialog>` opens with a wider-than-default max-width (~860px)
- **AND** the dialog content matches the existing wizard layout

#### Scenario: Review mode enters as a full-screen overlay
- **WHEN** user enters PR review mode from the inbox
- **THEN** a `<Dialog>` opens in full-screen mode covering the entire viewport
- **AND** the overlay enters and exits cleanly

### Requirement: Settings drawers use shadcn Sheet
The SettingsPanel, InstanceSettingsPanel, and BudgetWatchPanel SHALL be implemented with `<Sheet side="right">` from shadcn/ui, replacing the custom `settings-backdrop` + `settings-drawer` CSS patterns.

#### Scenario: Settings panel opens as a right-side sheet
- **WHEN** user clicks the gear icon in the sidebar
- **THEN** a `<Sheet side="right">` slides in from the right
- **AND** the sheet renders with Orbion's dark navy panel background

#### Scenario: Instance settings panel with state persistence
- **WHEN** user opens the instance settings panel
- **THEN** a `<Sheet side="right">` shows per-instance settings
- **AND** toggling a setting persists the change via the existing IPC flow

### Requirement: Catalog primitives use shadcn components
Across all remaining component files, plain `<button>` elements SHALL be replaced with `<Button>` from shadcn/ui, plain `<input>` elements with `<Input>`, and equivalent substitutions for `Card`, `Badge`, `Tabs`, `Tooltip`, `ScrollArea`, `Checkbox`, `Switch`, `Select`, and `Separator` where appropriate.

#### Scenario: Action buttons use shadcn Button
- **WHEN** a component file renders a `<button className="...">` for a primary action
- **THEN** it uses `<Button variant="default">` from shadcn/ui with the Orbion accent color

#### Scenario: Form inputs use shadcn Input
- **WHEN** a component file renders a `<input className="...">`
- **THEN** it uses `<Input>` from shadcn/ui with the Orbion input background and border

### Requirement: Dead CSS removed from theme.css
After all component migrations, the following CSS classes SHALL be removed from `theme.css`: `sidebar-context-menu`, `sidebar-context-menu-backdrop`, `fleet-activity-popover*`, `modal-backdrop`, `modal`, `modal-actions`, `settings-backdrop`, `settings-drawer`, `budget-panel-backdrop`, `stale-config-modal`, and any other classes that shadcn components now provide. The `theme.css` line count SHALL be reduced substantially from the pre-migration 8746 lines.

#### Scenario: No orphaned CSS classes
- **WHEN** `theme.css` is inspected after migration
- **THEN** no CSS class exists that is not referenced by any component file
- **AND** the line count is significantly lower than the 8746-line baseline

### Requirement: Visual identity preserved across migration
After migration, the app SHALL render with the same dark-navy panel layout, hairline borders, lime-green accent, monospace log surface, and typography as before. Acceptable delta: 1px radius rounding, shadcn's accessible focus-ring styling. Unacceptable: palette drift, layout reflow, font fallback change.

#### Scenario: Loop list renders identically
- **WHEN** the Electron app loads and shows the loop list for a mock instance
- **THEN** the panel backgrounds, borders, accent colors, and typography match the pre-migration appearance within the acceptable delta
