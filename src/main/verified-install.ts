/**
 * verified-install.ts — Integrity-verified remote install constants
 *
 * This module centralises pinned SHA-256 checksums and package versions
 * for all remote software installed by Orbion via SSH.  Each install
 * follows the **download-first, verify-then-execute** pattern instead of
 * the unsafe `curl … | sh` anti-pattern.
 *
 * When upgrading any pinned dependency:
 *   1. Update the `version` field.
 *   2. Download the script/binary locally and run `sha256sum`.
 *   3. Update the `sha256` field with the new hash.
 *   4. Record the update date in the comment.
 *
 * @see https://github.com/orbion/orbion/issues/51
 */

// ─── curl-pipe-sh replacement: download-verify-execute shell snippet ──────
//
// This shell function is embedded in remote scripts.  It downloads a URL
// to a temp file, verifies the SHA-256 checksum against a pinned value,
// and only then executes the script.  If the checksum mismatches the
// install is aborted — preventing silent MITM / DNS poisoning attacks.
//
// Usage in a remote script:
//   __VERIFIED_INSTALL_FN__
//   verified_install "https://example.com/install.sh" \
//     "abc123..." \
//     "$LAUNCH_DIR/install-example.log"

export const VERIFIED_INSTALL_FN = [
  "verified_install() {",
  '  local url="$1"',
  '  local expected_sha="$2"',
  '  local log_file="$3"',
  "  local tmp_file",
  "",
  '  tmp_file="$(mktemp /tmp/orbion-verify-XXXXXX)" || {',
  '    echo "VERIFIED_INSTALL_FAILED|mktemp"',
  "    return 1",
  "  }",
  "",
  "  # Download to temp file (not piped to shell)",
  '  if ! curl -fsSL "$url" -o "$tmp_file" 2>>"$log_file"; then',
  '    rm -f "$tmp_file"',
  '    echo "VERIFIED_INSTALL_FAILED|download"',
  "    return 1",
  "  fi",
  "",
  "  # Verify SHA-256 checksum",
  "  local actual_sha",
  '  actual_sha="$(sha256sum "$tmp_file" | cut -d" " -f1)" || {',
  '    rm -f "$tmp_file"',
  '    echo "VERIFIED_INSTALL_FAILED|sha256sum"',
  "    return 1",
  "  }",
  "",
  '  if [ "$actual_sha" != "$expected_sha" ]; then',
  '    echo "VERIFIED_INSTALL_FAILED|checksum_mismatch|expected=$expected_sha|got=$actual_sha" >> "$log_file"',
  '    rm -f "$tmp_file"',
  '    echo "VERIFIED_INSTALL_FAILED|checksum_mismatch"',
  "    return 1",
  "  fi",
  "",
  "  # Checksum passed — safe to execute",
  '  if ! sh "$tmp_file" 2>>"$log_file"; then',
  '    rm -f "$tmp_file"',
  '    echo "VERIFIED_INSTALL_FAILED|execution"',
  "    return 1",
  "  fi",
  "",
  '  rm -f "$tmp_file"',
  "  return 0",
  "}",
].join("\n");

// ─── Pinned remote scripts ────────────────────────────────────────────

/**
 * Tailscale install script — pinned checksum.
 *
 * Last verified: 2025-07-17
 * URL: https://tailscale.com/install.sh
 *
 * IMPORTANT: This hash will change whenever Tailscale updates their
 * install script.  Re-verify on every upgrade cycle.
 */
export const TAILSCALE_INSTALL = {
  url: "https://tailscale.com/install.sh",
  /** SHA-256 of the install script as of the verification date above. */
  sha256: "ada2fe9d54df0d3e5a77879470bda195b2c53d27ecd73aba6de270c795725625",
} as const;

/**
 * mise (runtime version manager) install script — pinned checksum.
 *
 * Last verified: 2025-07-17
 * URL: https://mise.run
 *
 * IMPORTANT: This hash will change whenever mise updates their
 * install script.  Re-verify on every upgrade cycle.
 */
export const MISE_INSTALL = {
  url: "https://mise.run",
  /** SHA-256 of the install script as of the verification date above. */
  sha256: "0b98c2dc48edc807be860a76e14209afcfe36684c591f92337c5d9ff909e7740",
} as const;

// ─── Pinned npm packages ──────────────────────────────────────────────
//
// Every `npm install -g` executed on remote VMs MUST pin an exact
// version.  Unversioned installs are vulnerable to registry compromise,
// typosquatting, and supply-chain attacks.

/**
 * All npm packages installed globally on remote VMs, with pinned versions.
 *
 * When upgrading:
 *   1. Update `version` to the desired release.
 *   2. Verify the package on npmjs.com or via `npm view <pkg>@<ver>`.
 *   3. Update the comment date.
 */
export const NPM_PACKAGES = {
  /** loop-task daemon — mandatory on every VM */
  loopTask: { pkg: "loop-task", version: "2.2.2" },
  /** opencode CLI — optional. Placeholder 0.0.0: not on public npm yet; update when upstream publishes. */
  openCode: { pkg: "opencode", version: "0.0.0" },
  /** Atlassian CLI (Jira) — optional. Placeholder 0.0.0: not on public npm yet; update when upstream publishes. */
  jira: { pkg: "@atlassian/acli", version: "0.0.0" },
  /** GitLab CLI — optional. Placeholder 0.0.0: not on public npm yet; update when upstream publishes. */
  gitlab: { pkg: "@gitlab-org/cli", version: "0.0.0" },
  /** Claude Code CLI — optional */
  claude: { pkg: "@anthropic-ai/claude-code", version: "2.1.212" },
} as const;

// ─── Shell-injection guards ────────────────────────────────────────────
//
// npm package names and versions are interpolated into remote shell scripts
// executed via SSH.  An allowlist approach is strictly safer than a denylist:
// only characters known to be valid in npm identifiers / semver strings are
// permitted, making the entire class of shell-injection attacks impossible.

/** Allowlist for unscoped npm package names (e.g. "loop-task", "opencode"). */
const NPM_PKG_UNSCOPED_RE = /^[a-z0-9][-a-z0-9]*$/;

/**
 * Allowlist for scoped npm package names (e.g. "@anthropic-ai/claude-code",
 * "@atlassian/acli").  The scope and package parts each follow the same
 * character rules as unscoped names.
 */
const NPM_PKG_SCOPED_RE = /^@[a-z0-9][-a-z0-9]*\/[a-z0-9][-a-z0-9]*$/;

/**
 * Allowlist for semver version strings with optional prerelease tag
 * (e.g. "2.2.2", "1.0.0-beta.1").  Must NOT match "latest" or any value
 * containing shell metacharacters.
 */
const NPM_VERSION_RE = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;

/**
 * Validate that an npm package name and version contain only characters that
 * are safe for shell interpolation.  Uses an allowlist approach: only
 * characters valid in npm package names and semver strings are permitted.
 *
 * This prevents shell-injection attacks where a compromised or typoed
 * `version` field (e.g. `0.0.0'; rm -rf /; echo ts`) would allow arbitrary
 * remote command execution on the target VM.
 *
 * @throws {Error} if `pkg` or `version` contains disallowed characters
 */
export function validateNpmIdentifier(pkg: string, version: string, context?: string): void {
  const label = context ?? `pkg=${pkg}, version=${version}`;

  if (!(NPM_PKG_UNSCOPED_RE.test(pkg) || NPM_PKG_SCOPED_RE.test(pkg))) {
    throw new Error(
      `Shell-unsafe npm package name in ${label} — ` +
        `only lowercase letters, digits, hyphens, and scoped @scope/name patterns are allowed. ` +
        `See src/main/verified-install.ts.`,
    );
  }

  if (!NPM_VERSION_RE.test(version)) {
    throw new Error(
      `Shell-unsafe npm version in ${label} — ` +
        `only semver strings (e.g. "2.2.2", "1.0.0-beta.1") are allowed; ` +
        `"latest" and values with shell metacharacters are forbidden. ` +
        `See src/main/verified-install.ts.`,
    );
  }
}

/**
 * Validate that no NPM_PACKAGES entry uses unsafe values.
 * Guards against both unpinned versions ("latest") and shell-injection
 * characters in package names or versions.  Fails fast at startup rather
 * than silently emitting insecure commands.
 *
 * @throws {Error} if any entry has unsafe `pkg` or `version`
 */
function validateNpmPackages(): void {
  for (const [key, entry] of Object.entries(NPM_PACKAGES)) {
    // Cast to string to satisfy strict `as const` type narrowing — the guard
    // must still run at runtime in case the const assertion is removed later.
    const pkg = entry.pkg as string;
    const version = entry.version as string;

    // Shell-safety allowlist (rejects "latest", injection chars, etc.)
    validateNpmIdentifier(pkg, version, `NPM_PACKAGES.${key}`);
  }
}

validateNpmPackages();

/**
 * Build an `npm install -g <pkg>@<version>` string for a pinned package.
 * This ensures every npm global install uses an explicit version specifier,
 * preventing supply-chain attacks via registry compromise.
 *
 * The `pkg` and `version` values are validated against a safe-character
 * allowlist before interpolation to prevent shell injection via SSH.
 *
 * @throws {Error} if `pkg` or `version` contains shell-unsafe characters
 */
export function pinnedNpmInstall(key: keyof typeof NPM_PACKAGES): string {
  const { pkg, version } = NPM_PACKAGES[key];
  // Defense in depth: validate again at call time in case a future caller
  // bypasses the module-load guard or passes dynamic input.
  validateNpmIdentifier(pkg, version, `NPM_PACKAGES.${key}`);
  return `npm install -g ${pkg}@${version}`;
}
