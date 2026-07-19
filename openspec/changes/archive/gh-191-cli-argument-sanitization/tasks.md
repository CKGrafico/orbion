# Tasks

## Task 1: Add CLI input validation helpers
- Status: DONE
- Agent: fullstack-engineer
- Tier: 1
- Files: src/main/index.ts
- Details: Added LABEL_RE, REPO_RE, CONTROL_CHAR_RE, validateLabels(), validateRepo(), sanitizeText(), validateCliInputs()

## Task 2: Apply validation at all CLI invocation sites
- Status: DONE
- Agent: fullstack-engineer
- Tier: 1
- Depends: Task 1
- Files: src/main/index.ts
- Details:
  - create-issue (gh): sanitize title/body, validate labels + repo
  - create-issue (az): sanitize title/body
  - add-label: validate labels + repo
  - edit-issue (gh): sanitize title/body, validate labels + repo
  - edit-issue (az): sanitize title/body

## Task 3: Verify build
- Status: DONE
- Agent: fullstack-engineer
- Tier: 2
- Details: `npx tsc --noEmit` passes with zero errors
