# Preserve SSH Control Path

## Why

Changing a VM's daemon endpoint from SSH to direct Tailscale access currently replaces the only stored SSH target. The application can still call the daemon over HTTP, but it cannot start or recover OpenCode remotely.

## What Changes

- Persist SSH control access independently from daemon HTTP access.
- Preserve existing SSH metadata during endpoint changes and migrate existing VM configurations.
- Use SSH control access for OpenCode recovery even when daemon access is direct or Tailscale.
- Provide clear, deduplicated runtime recovery errors.

## Impact

- Affected areas: environment configuration, VM wizard, agent runtime recovery, chat error display.
- No daemon API changes.
