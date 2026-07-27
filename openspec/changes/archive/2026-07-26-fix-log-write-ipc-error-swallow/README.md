# fix-log-write-ipc-error-swallow

Fix unhandled promise rejection when log:write IPC call rejects (rate limit, validation). Add explicit .catch() to fire-and-forget pattern.
