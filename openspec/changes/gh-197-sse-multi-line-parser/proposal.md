# gh-197-sse-multi-line-parser

Fix SSE stream parser splitting on `\n\n` boundaries which broke multi-line data values.
The LogViewer component now correctly assembles multiple `data:` lines. This is a visible
state change — multi-line log events are displayed correctly without truncation.
