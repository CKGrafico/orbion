# Per-endpoint health

## EndpointHealthTracker

A class that manages one `ConnectionSupervisor` per endpoint within an environment.

- `syncEndpoints(endpoints)`: creates supervisors for new endpoints, destroys removed ones.
- `getHealth()`: returns `EndpointHealth[]` from tracked state.
- `destroy()`: cleans up all supervisors.

## IPC events

- `connection:endpointHealth` — sent from main to renderer with `{ environmentId, health: EndpointHealth[] }`.
- Changes are pushed only when endpoint health actually changes (avoiding set-state loops).

## Renderer

- `App.tsx` subscribes to `onEndpointHealthChange` and updates `endpointHealth` state.
- `Sidebar.tsx` receives `endpointHealth` and renders per-endpoint health indicators:
  - Color-coded dot per endpoint (green=connected, orange=backoff, red=offline).
  - Error count badge when failures > 0.
  - Tooltip shows last error message.

## Supervisor lifecycle

- Created on `seedSupervisors()` at app start.
- Destroyed when environment is removed.
- Re-created when `setActiveEndpoint` changes the active URL (old supervisor destroyed, new one created for the active endpoint).
- `syncEndpointTracker` called after `addEndpoint`, `removeEndpoint`, and `setActiveEndpoint`.
