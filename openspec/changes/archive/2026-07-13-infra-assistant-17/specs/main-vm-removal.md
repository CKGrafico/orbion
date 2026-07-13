# Spec: Main VM Removal

## Behavior

When the environment with `role: "main-vm"` is removed:

1. The infra chat panel is immediately hidden.
2. If other coding environments exist, a modal (`PickMainVmModal`) appears prompting the user: "The main VM was removed. Pick a new one to keep the infrastructure assistant."
   - The modal lists remaining environments as selectable items.
   - User can pick one (promotes it to main-vm) or skip (no main-vm, infra panel gone).
3. If no other environments exist, no modal — the state is simply empty.

## PickMainVmModal

- Title: "Pick a new main VM"
- Description: "The infrastructure assistant needs a main VM to run on. Choose one of your environments or skip to disable it."
- List of candidate environments (all with `role: "coding"`).
- Action buttons: "Set as main VM" (per item) and "Skip" (close modal).

## State updates

- `config:setMainVm(newId)` is called when user picks a new one.
- The infra panel reappears if the new main-vm has `infraOpenCode` configured.
