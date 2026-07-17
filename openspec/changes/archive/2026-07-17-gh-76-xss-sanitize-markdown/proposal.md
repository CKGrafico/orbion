# gh-76: Security: XSS via MarkdownContent rendering without sanitization (rehype-sanitize missing)

## Change ID

gh-76-xss-sanitize-markdown

## Description

The `react-markdown` component in `MarkdownContent.tsx` uses `rehype-highlight` but does not include `rehype-sanitize`, allowing raw HTML, `<script>` tags, `<iframe>`, event handlers (`onerror`), and `javascript:` URLs to be rendered from any markdown content. Since this is an Electron renderer process, a successful XSS can escalate via `window.api` preloads to the main process.

Additionally, daemon-controlled data (machine names, URLs, issue titles, labels) is interpolated directly into markdown strings in `InfraChatPanel.tsx` without escaping, enabling injection attacks.

## Rationale

Arbitrary JavaScript execution in the Electron renderer can escalate to the main process via `window.api` preload bridge, potentially compromising SSH credentials, session tokens, and VM management capabilities. This is rated 8/10 Critical.

## Acceptance Criteria

- rehype-sanitize is added as a rehype plugin to MarkdownContent.tsx, stripping dangerous HTML elements and attributes
- Machine names, health status, endpoint kinds/URLs are escaped before markdown interpolation in formatMachineStatusReport
- Issue titles and labels are escaped before markdown interpolation in formatIssueStack
- pnpm typecheck passes
