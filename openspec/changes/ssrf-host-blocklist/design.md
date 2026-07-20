## Context

The main process `isAllowedBaseUrl()` validates URL protocol only (`http:`/`https:`). A compromised renderer can register an environment pointing at `http://169.254.169.254` (cloud metadata), `http://localhost:*`, or any internal host. `handleApiRequest` and `handleStreamSubscribe` forward the stored bearer token to these URLs without host validation.

SSH tunnels legitimately resolve to `http://127.0.0.1:<localPort>` via `resolveEffectiveUrl()` in `tunnel-registry.ts`. The tunnel registry tracks which `127.0.0.1:<port>` combos are active tunnels in a `Map<string, TunnelEntry>` keyed by `${environmentId}:${endpointId}`.

Current call flow:
1. Renderer sends `api:request` with `baseUrl` + `path`
2. `isAllowedBaseUrl(args.baseUrl)` checks protocol only
3. `findEnvironmentIdByUrl(args.baseUrl)` maps URL to environment
4. `resolveEffectiveUrlForBaseUrl()` resolves SSH tunnel to `http://127.0.0.1:<port>`
5. `fetchAndUnwrap()` sends the request with bearer token

## Goals / Non-Goals

**Goals:**
- Block SSRF to cloud metadata endpoints (169.254.169.254, 169.254.169.253, fd00:ec2::254)
- Block SSRF to link-local range (169.254.0.0/16)
- Block loopback SSRF (127.0.0.0/8, ::1, localhost) except for registered SSH tunnels
- Apply the check at both registration time (`config:addEnvironment`, `config:addEndpoint`) and request time (`api:request`, `stream:subscribe`)
- Validate the effective URL post-tunnel-resolution to catch DNS rebinding

**Non-Goals:**
- DNS resolution of hostnames to IPs before request (too fragile, async DNS can fail or be timing-dependent; blocked ranges are IP-only so hostname-based attacks are limited by the allowlist)
- Blocking private RFC 1918 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) as legitimate use cases exist for on-prem daemons
- IPv6 full private range blocking (only the specific EC2 IPv6 metadata address)

## Decisions

1. **Pure string/regex IP matching, no DNS resolution.** Node.js `dns.resolve()` is async and unreliable for short-lived requests. The blocked ranges are well-known IPs that appear directly in URLs. Hostname-based SSRF (e.g. `http://metadata.google.internal`) is mitigated by the existing `isAllowedApiOperation()` allowlist limiting which paths can be queried.

2. **Two-layer check: registration + request time.** Registration (`isAllowedBaseUrl`) blocks metadata/link-local and blocks loopback for non-SSH endpoints. Request time checks the effective URL after tunnel resolution, allowing loopback only if a tunnel registry entry exists for that port. This prevents a renderer from registering a non-SSH `http://127.0.0.1:8845` endpoint.

3. **Tunnel exemption via registry lookup.** `tunnel-registry.ts` already tracks `localPort` for every active tunnel. A new exported function `isTunnelLocalPort(port)` checks if a port corresponds to a registered tunnel. Loopback URLs with a port in the tunnel registry are allowed; all other loopback is rejected.

4. **Host validation in `isAllowedHost()` as a standalone function.** Separated from URL parsing, testable without Electron. Takes a URL string plus an optional `allowLoopback` flag. Returns `{ allowed: boolean, reason?: string }`.

5. **i18n error key:** `vmWizard.mainHostBlocked` with `{ host }` param for user-facing rejection messages.

## Risks / Trade-offs

- **[Hostname-based SSRF]** A renderer registers `http://metadata.google.internal` which resolves to 169.254.169.254. The host check sees a non-IP hostname and allows it. **Mitigation:** `isAllowedApiOperation()` restricts paths to `/api/*` patterns. The metadata endpoint does not serveloop-task `/api/*` routes, so the response will fail envelope parsing and no data leaks. The bearer token is sent but the metadata service ignores it.

- **[DNS rebinding after check]** A hostname resolves to a safe IP at registration time but to 169.254.169.254 at request time. **Mitigation:** DNS rebinding requires the attacker to control DNS for a domain they register. The `findEnvironmentIdByUrl()` lookup ensures the URL must match a registered environment, making this impractical: the renderer cannot change the URL between registration and request.

- **[Breaking legitimate localhost daemons]** Users with a local loop-task daemon on `http://localhost:8845` (kind=direct) will be blocked. **Mitigation:** This is the correct security posture. Local daemons should be registered as kind=direct with `http://localhost:8845` and will need to use `127.0.0.1` or the actual hostname. However, this IS a behavioral change. The registration-time check should allow loopback for direct endpoints since the user explicitly chose to connect to localhost. Only the request-time check on the effective URL needs loopback awareness for SSH tunnels. **Revised decision:** Allow loopback at registration time for all endpoint kinds (the user is choosing to connect there). Block only metadata/link-local IPs at registration. Block loopback at request time only when it does NOT come from a registered SSH tunnel.

- **[Port scanning via tunnel registry]** An attacker probes which local ports have tunnels. **Mitigation:** The registry only stores ports that the main process itself opened (19000-19999 range). Attackers already know this range from the open-source code.
