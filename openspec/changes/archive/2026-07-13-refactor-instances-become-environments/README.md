# refactor-instances-become-environments

Split Instance into Environment + AccessEndpoint. An environment is one machine running a loop-task daemon; an access endpoint is one way to reach it (direct URL, SSH tunnel, Tailscale). Includes migration, fingerprint route, per-endpoint health tracking.
