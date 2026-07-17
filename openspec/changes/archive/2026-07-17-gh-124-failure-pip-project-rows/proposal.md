# gh-124: Failure pip on project rows (rolls up even when collapsed)

## Change ID

gh-124-failure-pip-project-rows

## Description

Project rows in the sidebar show a red alert pip (small dot overlay) on the project color dot when any loop in that project on any instance is failed. The pip clears automatically when no failures remain. Loops on unreachable (offline/blocked/unknown) instances do NOT trigger the pip.

## Rationale

Users need to see at a glance which projects have problems, even when those project rows are collapsed. The failure pip is a minimal, unobtrusive visual signal that composes with the existing project dot and loop count pill.

## Acceptance Criteria

- Project rows show an alert pip when any loop in that project on any instance is failed
- The pip clears when no failures remain
- Unknown (unreachable-instance) loops do not trigger the pip
- The pip has an accessible tooltip ("A loop in this project has failed")
