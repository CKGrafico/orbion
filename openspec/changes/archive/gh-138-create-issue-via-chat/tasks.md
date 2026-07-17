# Tasks: gh-138 Create issue via chat

- [x] 1.1 Extend InfraAction type and add CreateIssueParams/CreateIssueResult interfaces in src/shared/ipc.ts <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/shared/ipc.ts] -->
- [x] 1.2 Add "create-issue" case in main process infra:executeAction handler with gh/az CLI detection and execution <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/main/index.ts] -->
- [x] 1.3 Add i18n keys for issue creation messages and errors in en.json <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [src/renderer/src/i18n/en.json] -->
- [x] 1.4 Add "create-issue" mock in MockInfraService <!-- agent: frontend-engineer.fast, depends_on: [1.1], touches: [src/renderer/src/services/mock/MockServices.ts] -->
- [x] 2.1 Extend InfraChatPanel prompt parser to detect "create issue" intent, extract title/body, and show QuestionRequest for approval <!-- agent: frontend-engineer.build, depends_on: [1.1], touches: [src/renderer/src/components/InfraChatPanel.tsx] -->
- [x] 2.2 Handle "create-issue" action result formatting in InfraChatPanel <!-- agent: frontend-engineer.build, depends_on: [2.1, 1.2], touches: [src/renderer/src/components/InfraChatPanel.tsx] -->
- [x] 2.3 Update infra helpText i18n to mention issue creation <!-- agent: frontend-engineer.fast, depends_on: [2.1], touches: [src/renderer/src/i18n/en.json] -->
- [x] 3.1 Run pnpm typecheck and fix any errors <!-- agent: frontend-engineer.fast, depends_on: [1.2, 2.2, 1.3, 1.4], touches: [] -->
