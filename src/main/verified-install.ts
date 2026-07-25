/** Integrity-verified remote install constants. Download-first, verify-then-execute (not `curl | sh`). When upgrading: update `version`, run `sha256sum`, update `sha256`. @see https://github.com/orbion/orbion/issues/51 */

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

export const TAILSCALE_INSTALL = {
  url: "https://tailscale.com/install.sh",
  sha256: "ada2fe9d54df0d3e5a77879470bda195b2c53d27ecd73aba6de270c795725625",
} as const;

export const MISE_INSTALL = {
  url: "https://mise.run",
  sha256: "0b98c2dc48edc807be860a76e14209afcfe36684c591f92337c5d9ff909e7740",
} as const;

// Every `npm install -g` on remote VMs MUST pin an exact version — unversioned
// installs are vulnerable to registry compromise and supply-chain attacks.

export const NPM_PACKAGES = {
  loopTask: { pkg: "loop-task", version: "2.2.2" },
  openCode: { pkg: "opencode", version: "0.0.0" },
  jira: { pkg: "@atlassian/acli", version: "0.0.0" },
  gitlab: { pkg: "@gitlab-org/cli", version: "0.0.0" },
  claude: { pkg: "@anthropic-ai/claude-code", version: "2.1.212" },
} as const;

// Shell-injection guards: npm names/versions are interpolated into remote shell
// scripts via SSH. Allowlist approach (only valid npm/semver chars) makes
// the entire class of injection attacks impossible.

const NPM_PKG_UNSCOPED_RE = /^[a-z0-9][-a-z0-9]*$/;
const NPM_PKG_SCOPED_RE = /^@[a-z0-9][-a-z0-9]*\/[a-z0-9][-a-z0-9]*$/;
const NPM_VERSION_RE = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;

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

/** @throws {Error} */
function validateNpmPackages(): void {
  for (const [key, entry] of Object.entries(NPM_PACKAGES)) {
    // Cast to string: satisfies `as const` narrowing; guard still runs at runtime in case the const assertion is removed later.
    const pkg = entry.pkg as string;
    const version = entry.version as string;

    validateNpmIdentifier(pkg, version, `NPM_PACKAGES.${key}`);
  }
}

validateNpmPackages();

export function pinnedNpmInstall(key: keyof typeof NPM_PACKAGES): string {
  const { pkg, version } = NPM_PACKAGES[key];
  // Defense in depth: validate again at call time in case a future caller bypasses the module-load guard.
  validateNpmIdentifier(pkg, version, `NPM_PACKAGES.${key}`);
  return `npm install -g ${pkg}@${version}`;
}
