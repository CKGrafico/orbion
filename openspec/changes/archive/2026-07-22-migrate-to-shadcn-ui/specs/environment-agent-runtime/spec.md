## ADDED Requirements

### Requirement: Frontend engineer agent uses shadcn skill
The `frontend-engineer` agent SHALL list `@shadcn` under its `## Abilities > Development` section and SHALL NOT list `@accelint-design-foundation`. The shadcn skill provides guidance for working with shadcn/ui components and Tailwind CSS v4.

#### Scenario: Frontend engineer loads shadcn skill
- **WHEN** the frontend-engineer agent starts
- **THEN** it loads `@shadcn` skill and uses shadcn/ui as the primary component library
- **AND** it does NOT load `@accelint-design-foundation`

#### Scenario: Skills lock includes shadcn entry
- **WHEN** `skills-lock.json` is inspected
- **THEN** it contains a `shadcn` or `shadcn/ui` entry with the correct source reference
