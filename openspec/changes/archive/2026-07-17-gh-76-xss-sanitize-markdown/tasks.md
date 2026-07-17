# gh-76 Tasks

- [x] 1.1 Add rehype-sanitize dependency and import in MarkdownContent.tsx <!-- agent: frontend-engineer.build, depends_on: [], touches: [package.json, src/renderer/src/chat/MarkdownContent.tsx] -->
- [x] 1.2 Add escapeMd() utility and apply to machine names/URLs in formatMachineStatusReport <!-- agent: frontend-engineer.build, depends_on: [], touches: [src/renderer/src/components/InfraChatPanel.tsx] -->
- [x] 1.3 Apply escapeMd() to issue titles and labels in formatIssueStack <!-- agent: frontend-engineer.build, depends_on: [1.2], touches: [src/renderer/src/components/InfraChatPanel.tsx] -->
- [x] 1.4 Verify pnpm typecheck passes <!-- agent: frontend-engineer.fast, depends_on: [1.1,1.2,1.3], touches: [] -->
