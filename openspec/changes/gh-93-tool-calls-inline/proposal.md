# Render agent tool calls inline in the stream

**Issue:** #93  
**Branch:** `gh-93-tool-calls-inline`  
**Status:** Implemented

## Problem

Tool invocations during agent chat were invisible in the stream. The `TranscriptRow` types included `tool-call`, `tool-calls-expander`, and `turn-fold` row kinds, the `useTranscript` hook already built these rows, and the CSS styles existed — but `InfraChatPanel.tsx` only rendered `user-message`, `assistant-message`, and `question-request` rows. Everything else fell through to `default: return null`.

## Solution

Wire the existing data model into the chat renderer with compact inline blocks:

1. **ToolCallInlineBlock** — renders each tool call as a compact row: kind icon + title (monospace, truncated) + duration + status glyph. Clicking the header toggles output visibility.
2. **Output truncation with expand** — long output (>6 lines or >500 chars) is truncated with a "Show more (N lines)" button; clicking toggles full output.
3. **ToolCallsExpander** — when a turn has >3 tool calls, shows "{count} earlier tool calls" for the hidden ones.
4. **TurnFold** — when a finished turn is collapsed, shows a one-line summary: "worked for Xs · N tool calls".

## Acceptance criteria

- [x] Tool invocations render as compact inline blocks: name + argument summary, distinct from prose
- [x] Long output truncates with an expand affordance

## Notes

- Generic renderer; loop-specific cards come later and supersede this for loop tools.
- The existing CSS design tokens (dark navy, monospace titles, status-coloured glyphs) are reused — no new theme or UI kit.
- `KIND_ICONS` and `STATUS_GLYPHS` are now exported from `MarkdownContent.tsx` for reuse.
