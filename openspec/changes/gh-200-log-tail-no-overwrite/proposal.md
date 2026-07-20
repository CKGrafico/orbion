# gh-200-log-tail-no-overwrite

Fix initial log tail overwriting live SSE lines. The LogViewer component uses
setInitialRows which merges instead of replacing. This is a visible state change —
live log lines received while the tail request pending are preserved in the UI.
