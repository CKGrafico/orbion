# Tasks — Fleet health sidebar footer

## T1: Create FleetHealthFooter component
- **Agent**: frontend-engineer
- **Tier**: 2
- **Depends on**: —
- **Touches**: `src/renderer/src/components/FleetHealthFooter.tsx`
- **Description**: New component that computes fleet aggregations and renders instance count, connection summary, failure pill, and unreachable pill with click-to-jump navigation.

## T2: Add i18n keys for fleet health
- **Agent**: frontend-engineer
- **Tier**: 1
- **Depends on**: —
- **Touches**: `src/renderer/src/i18n/en.json`
- **Description**: Add keys: `fleetHealth.instancesConnected`, `fleetHealth.loopFailing`, `fleetHealth.loopsFailing`, `fleetHealth.unreachable`, `fleetHealth.unreachablePlural`

## T3: Add CSS styles for fleet health footer
- **Agent**: frontend-engineer
- **Tier**: 1
- **Depends on**: —
- **Touches**: `src/renderer/src/theme.css`
- **Description**: Add `.fleet-health-footer`, `.fleet-health-summary`, `.fleet-health-pill`, `.fleet-health-pill-danger`, `.fleet-health-pill-unreachable` styles

## T4: Wire FleetHealthFooter into Sidebar and App
- **Agent**: frontend-engineer
- **Tier**: 2
- **Depends on**: T1, T2, T3
- **Touches**: `src/renderer/src/components/Sidebar.tsx`, `src/renderer/src/App.tsx`
- **Description**: Import FleetHealthFooter into Sidebar, pass down navigation callbacks from App through Sidebar props, restructure the sidebar-footer layout to include FleetHealthFooter alongside FleetActivityReadout
