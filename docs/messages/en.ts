const en = {
  "nav": {
    "loopEngineering": "Loop Engineering",
    "features": "Features",
    "docs": "Docs",
    "getStarted": "Get started",
    "github": "GitHub repository",
    "openMenu": "Open menu",
    "closeMenu": "Close menu"
  },
  "hero": {
    "eyebrow": "The open-source control plane for Loop Engineering",
    "headline1": "Every loop. Every machine.",
    "headline2": "One window.",
    "subtext": "Orbion watches every loop-task daemon on every machine you own: status, logs, and AI agents in one dark window.",
    "ctaPrimary": "Get started",
    "ctaSecondary": "GitHub",
    "screenshotAlt": "The Orbion window: environments with health dots in the sidebar, loops with status and intervals in the main panel",
    "caption": "The fleet view: every environment, every loop, and the one thing waiting on you."
  },
  "loopEngineering": {
    "heading": "Attention doesn't scale. Cadence does.",
    "p1": "Loop Engineering is the practice of giving work a cadence instead of your attention.",
    "p2": "You write loops: run the tests, sync the repo, point an agent at the lint warnings, every thirty minutes.",
    "p3": "They run on machines you own. You check in when something needs a human.",
    "framing": "Others named the practice. Orbion is tooling for it.",
    "readingLabel": "Further reading"
  },
  "beatLogs": {
    "heading": "Watch every loop run.",
    "p1": "Each loop shows status, interval, next and last run, exit code, PID, and command.",
    "p2": "Logs stream over SSE with autoscroll. Follow a run as it happens.",
    "alt": "Loop detail view with an overview grid and a live log stream following a run"
  },
  "beatChat": {
    "heading": "An agent for the fleet itself.",
    "p1": "Your main VM runs a dedicated OpenCode runtime for infrastructure work.",
    "p2": "It asks before it acts. Approvals and questions surface in chat.",
    "p3": "Coding chats stay per VM. Fleet chat stays separate.",
    "alt": "The infrastructure chat panel with an approval request and its four decision buttons"
  },
  "beatWizard": {
    "heading": "Fresh VM to paired in minutes.",
    "p1": "Give Orbion SSH access. It probes the box, installs loop-task and OpenCode, forwards the port, and pairs.",
    "p2": "Tailscale machines appear on their own via MagicDNS. Direct URLs work too.",
    "alt": "The add VM wizard walking through probe, install, tunnel, and pairing steps"
  },
  "bento": {
    "heading": "Built for the second monitor.",
    "fleet": {
      "title": "Fleet at a glance",
      "desc": "Connection health, status pills, and unread dots for every machine, local or remote, in one sidebar."
    },
    "logs": {
      "title": "Live log follow",
      "desc": "Streamed over SSE with autoscroll. Exit codes, PID, interval, and next run for every loop."
    },
    "ssh": {
      "title": "SSH onboarding",
      "desc": "Point Orbion at a fresh VM. It probes, installs the daemon, forwards the port, pairs."
    },
    "tailscale": {
      "title": "Tailscale autodiscovery",
      "desc": "Machines on your tailnet show up by MagicDNS name. Direct URLs work too."
    },
    "chat": {
      "title": "Infra chat with approvals",
      "desc": "A dedicated OpenCode runtime on your main VM for fleet ops. Approve or deny actions in chat."
    },
    "signal": {
      "title": "Signal, not noise",
      "desc": "Priority status pills, unread dots, OS notifications, and per-environment mute. Loud when it matters, quiet otherwise."
    }
  },
  "trust": {
    "heading": "Your machines. Your keys.",
    "p1": "AI provider auth happens on the VM: run <code>opencode auth login</code> there. Orbion never sees a credential.",
    "p2": "MIT licensed. Every line is on GitHub.",
    "col1": "Runs on your hardware",
    "col2": "No hosted middleman",
    "col3": "MIT, forever"
  },
  "quickstart": {
    "heading": "Clone it. Run it.",
    "intro": "v0.1. No installers yet. Node 20 and pnpm are the only requirements.",
    "outro": "No account, no telemetry, no waitlist. If it breaks, open an issue.",
    "ctaDocs": "Get started",
    "ctaStar": "GitHub",
    "starAsk": "If Orbion is useful, a star helps other people find it.",
    "copy": "Copy commands",
    "copied": "Copied"
  },
  "footer": {
    "line": "Orbion. MIT licensed. Built in the open by Plain Concepts.",
    "docs": "Docs",
    "github": "GitHub",
    "loopTask": "loop-task"
  }
} as const

export default en
