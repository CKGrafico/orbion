# Proposal: Instances become environments with access endpoints

## Why

An instance today is just a base URL. That stops working the moment the same VM can be reached in more than one way: a direct URL, an SSH-forwarded port, a Tailscale address. If each of those becomes its own instance type we end up with three code paths that all mean "this machine", plus duplicated health state and a confusing UX.

## What

Split the concept in two:

- **Environment**: one machine running a loop-task daemon. Stable id, display name, cached state.
- **Access endpoint**: one way to reach an environment. Today that's a direct URL. Later: an SSH-forwarded local port, a Tailscale IP or MagicDNS name.

Identity comes from the daemon via `GET /.well-known/orbion/environment` (fingerprint route). Until the daemon ships that route, fall back to treating the URL as identity.

## Acceptance criteria

- [x] Saved instances migrate to single-endpoint environments without user action
- [x] An environment can hold several endpoints; switching the active one doesn't duplicate it in the sidebar
- [x] Health is tracked per environment, endpoint failures are visible per endpoint
- [x] The SSH work in #1 can be expressed as just another endpoint kind
