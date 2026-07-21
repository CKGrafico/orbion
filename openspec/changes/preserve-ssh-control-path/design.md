# Design

## Separate Reach Paths

Each environment has two independent connection concerns:

- Daemon access: the active HTTP endpoint used for loop-task APIs.
- Control access: an optional SSH target used for onboarding, command execution, and local-only service recovery.

Changing daemon access must not clear control access.

## Migration

Existing environments derive control access from any saved SSH endpoint. Configurations without a saved SSH endpoint remain usable for direct HTTP access, but runtime recovery reports that SSH control access is required.

## Runtime Recovery

OpenCode recovery checks server reachability first. If unavailable, it uses the environment control target to start the server and waits for readiness. Concurrent checks share one recovery attempt per environment to avoid duplicate commands and logs.

Claude Code remains a CLI runtime and is not started as an OpenCode HTTP service.
