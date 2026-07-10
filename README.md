# Orbion

**The open-source control plane for Loop Engineering.**

Desktop control plane for [loop-task](https://github.com/CKGrafico/loop-task) instances.
Add one or more running loop-task daemons by their HTTP API URL (e.g.
`http://127.0.0.1:8845`) and watch their loops, tasks, projects, and live logs
from a single app.

## What it does (v1)

- **Instances**: register any number of loop-task daemons by API URL (one per
  machine/VM), with connection health dots. Persisted locally.
- **Loops**: live list per instance (status, interval, runs, last exit, next run),
  filterable from the bottom bar. Status colors match the loop-task TUI.
- **Logs**: per-loop log viewer — initial tail plus **live follow** via the
  daemon's SSE stream (`/api/loops/:id/logs/stream`), with autoscroll and copy.

Read-only for now: no pause/trigger/edit actions yet.

## Requirements

- Node.js >= 20, [pnpm](https://pnpm.io)
- A running loop-task daemon with the HTTP API (loop-task >= 2.1). Swagger lives at
  `http://127.0.0.1:8845/api/docs`.

## Develop

```bash
pnpm install
pnpm dev        # Electron app (main + preload + renderer, hot reload)
pnpm dev:web    # renderer only, in a browser, with mocked data (no Electron/daemon)
pnpm typecheck
pnpm build      # production build into out/
```

## Architecture

Electron + electron-vite + React 19 + strict TypeScript. Plain CSS design tokens
(`src/renderer/src/theme.css`) — a dark warm-gray theme with floating rounded
panels and a segmented pill switcher between sections.

```
renderer (React)  ── window.api (contextBridge) ──►  preload
                                                      │ ipcRenderer
main process  ◄───────────────────────────────────────┘
  ├─ api:request            fetch → loop-task HTTP API, unwraps { ok, data }
  └─ stream:subscribe/…     SSE client for log streams → webContents.send
```

All HTTP runs in the **main process**: the loop-task API sends no CORS headers, so
renderer-side fetch would be blocked — and main-process fetch works unchanged for
instances on other machines. The renderer stays sandboxed (`contextIsolation` on,
`nodeIntegration` off).

The loop list is **polled** every 5s (the daemon's `/api/events` stream is not yet
fed server-side); log following is true push via SSE.

When `window.api` is missing (plain browser via `pnpm dev:web`), a mock adapter
(`src/renderer/src/mock.ts`) serves fake loops/projects/logs and a synthetic log
stream, so the UI can be developed and screenshotted without a daemon.

## Remote instances (VMs)

The loop-task daemon currently binds its HTTP API to `127.0.0.1` only. To manage a
daemon on another machine, forward its port, e.g.:

```bash
ssh -L 8846:127.0.0.1:8845 user@vm-host
# then add the instance as http://127.0.0.1:8846
```

A configurable bind address in loop-task would remove this step (future work).

## License

MIT
