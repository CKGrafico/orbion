## ADDED Requirements

### Requirement: Toast component for transient notifications
The system SHALL provide a reusable toast/snackbar component that displays transient messages at the bottom of the main panel. The toast SHALL match the existing dark warm-gray design tokens.

#### Scenario: Show toast with action button
- **WHEN** `showToast({ message, action, duration })` is called
- **THEN** a toast SHALL appear at the bottom of the main content panel
- **AND** the toast SHALL display the message text and an optional action button
- **AND** the toast SHALL auto-dismiss after `duration` milliseconds (default 5000)

#### Scenario: User clicks toast action
- **WHEN** the toast has an action button and the user clicks it
- **THEN** the action callback SHALL be invoked
- **AND** the toast SHALL dismiss immediately

#### Scenario: Toast auto-dismisses
- **WHEN** the toast duration expires without user interaction
- **THEN** the toast SHALL dismiss
- **AND** the optional `onDismissed` callback SHALL be invoked

### Requirement: Toast provider and hook
The system SHALL provide a `ToastProvider` component and a `useToast()` hook. The provider SHALL wrap the application's main panel area. The hook SHALL expose a `showToast` function that can be called from any child component.

#### Scenario: Multiple toasts replacement
- **WHEN** a toast is currently visible and `showToast` is called again
- **THEN** the existing toast SHALL be replaced by the new toast immediately
- **AND** the `onDismissed` callback of the replaced toast SHALL be invoked

### Requirement: Toast styling matches design system
The toast component SHALL use the following design tokens: `bg_elevated` background, `text_primary` for message, `accent` for action button text, `border_subtle` for border, `radius md` for corners. The toast SHALL have a subtle drop shadow (`0 4px 16px rgba(0,0,0,0.3)`).

#### Scenario: Toast visual appearance
- **WHEN** a toast is displayed
- **THEN** it SHALL have `bg_elevated` background, `text_primary` message color, `accent` action text
- **AND** it SHALL have a 1px `border_subtle` border, `radius md` (8px) corners
- **AND** it SHALL have the specified drop shadow
