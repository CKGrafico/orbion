# Proposal: Instances become Environments with Access Endpoints

## Why

An instance today is just a base URL. That stops working the moment the same VM can be reached in more than one way: a direct URL, an SSH-forwarded port (#1), a Tailscale address. If each becomes its own instance type we end up with three code paths that all mean "this machine", plus duplicated health state and a confusing UX when one path dies while another still works.

## What

Split the concept in two:

- **Environment**: one machine running a loop-task daemon. Stable id, display name, cached state. This is what the sidebar lists.
- **Access endpoint**: one way to reach an environment. Today that's a direct URL. Later: an SSH-forwarded local port, a Tailscale IP or MagicDNS name. An environment holds a list of candidate endpoints and remembers which one it last connected through.

Identity comes from the daemon, not from the address. A fingerprint route (`GET /.well-known/orbion/environment`) returns a stable id and label so two endpoints that land on the same daemon collapse into one environment. Until the daemon ships that route, the URL is used as identity.

## Design decisions

- Endpoint preference is stored by kind (`direct`, `ssh`, `tailscale`), not by raw address. LAN IPs rotate, the kind survives.
- Connection code takes an environment and resolves an endpoint, so SSH (#1) plugs in as a new endpoint kind without touching the renderer.
- Per-endpoint health is tracked independently by `EndpointHealthTracker`, with results pushed to the renderer via IPC events.
