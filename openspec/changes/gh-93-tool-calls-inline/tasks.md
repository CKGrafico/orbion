# Tasks

- [x] 1.1 Create ToolCallInlineBlock component (compact inline block: icon + title + duration + status; output with truncation and expand) <!-- agent: default, depends_on: [], touches: [src/renderer/src/chat/ToolCallInlineBlock.tsx] -->
- [x] 1.2 Create ToolCallsExpander component (collapsible "{count} earlier tool calls" button) <!-- agent: default, depends_on: [], touches: [src/renderer/src/chat/ToolCallsExpander.tsx] -->
- [x] 1.3 Create TurnFold component (summary row for collapsed turns) <!-- agent: default, depends_on: [], touches: [src/renderer/src/chat/TurnFold.tsx] -->
- [x] 2.1 Wire tool-call/expander/fold rows into InfraChatPanel renderer <!-- agent: default, depends_on: [1.1, 1.2, 1.3], touches: [src/renderer/src/components/InfraChatPanel.tsx] -->
- [x] 2.2 Export KIND_ICONS and STATUS_GLYPHS from MarkdownContent <!-- agent: default, depends_on: [1.1], touches: [src/renderer/src/chat/MarkdownContent.tsx] -->
- [x] 3.1 Add i18n keys for tool call rendering (chat.showMore, chat.showLess, chat.turnFold) <!-- agent: default, depends_on: [], touches: [src/renderer/src/i18n/en.json] -->
- [x] 3.2 Add CSS for tool-call-duration, tool-call-expand-btn, expander-icon, turn-fold-icon <!-- agent: default, depends_on: [1.1], touches: [src/renderer/src/theme.css] -->
- [x] 4.1 Verify typecheck passes with no new errors <!-- agent: default, depends_on: [2.1, 3.1, 3.2], touches: [] -->
