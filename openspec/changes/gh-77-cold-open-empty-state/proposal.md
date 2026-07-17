# Cold-open empty state that launches the add-instance wizard

## Change ID
gh-77-cold-open-empty-state

## Summary
When no instances/environments are configured, the entire window shows a single centered card with a headline, teaching copy, and an "Add your first machine" button that opens the add-instance wizard. No sidebar tree, loop UI, or chat renders in this state.

## Problem
A first-time user with nothing configured sees the existing "No environment selected" empty state inside the normal two-panel layout (sidebar + main area). This is confusing because it shows navigation chrome (sidebar, titlebar controls) that has nothing to navigate to. The user has no clear starting point and no explanation of what Orbion is or what they need to do first.

## Solution
- Add a `ColdOpen` component that renders a centered card with the Orbion brand mark, a welcome headline, one line of teaching copy explaining that Orbion talks to loop-task daemons and adding one machine is the only setup needed, and a primary "Add your first machine" button.
- Modify `App.tsx` to detect the cold-open state (environments array is empty AND the store has finished loading) and render only the ColdOpen card inside the main panel — no sidebar, no InfraChatPanel, no loop/project content.
- Hide the sidebar toggle and notifications mute button from the titlebar in cold-open state since they have no function when nothing is configured.
- Add a `loaded` flag to `useEnvironments` so the App can distinguish "store hasn't loaded yet" from "loaded but empty" and avoid flashing the cold-open during initial load.
- Add i18n strings for the cold-open copy and button.
- Add CSS styles for the cold-open card that match the existing visual language (dark navy panels, text hierarchy, lime-green accent button).

## Acceptance criteria mapping
- [x] When no instances are configured, the whole window shows one centered card: a headline, one line of teaching copy, and an "Add your first machine" button
- [x] Teaching copy (plain, active voice) explains that Orbion talks to loop-task daemons running on your machines, and that adding one machine is the only setup needed
- [x] The button opens the add-instance flow. No sidebar tree, loop UI, or chat renders in this state

## Affected files
- `src/renderer/src/components/ColdOpen.tsx` -- new component for the centered welcome card
- `src/renderer/src/App.tsx` -- cold-open detection and layout branching, import ColdOpen
- `src/renderer/src/store.ts` -- expose `loaded` flag from useEnvironments
- `src/renderer/src/i18n/en.json` -- cold-open headline, copy, button text
- `src/renderer/src/theme.css` -- cold-open card styles
