/**
 * tool-definitions.ts — Single source of truth for all optional VM tools
 *
 * Adding a new tool requires only:
 *   1. Add an entry to TOOL_DEFINITIONS below
 *   2. Add the install command logic in `generateInstallBlock()` (ssh-launch.ts)
 *
 * No changes needed in ipc.ts types, probe parsing, result parsing, or the renderer -
 * they all read from this data-driven definition.
 *
 * @see https://github.com/orbion/orbion/issues/52
 */

/**
 * Represents the install strategy for a tool.
 * - `npm`  — install via `npm install -g` using the pinned package from verified-install.ts
 * - `apt`  — install via `apt-get` only
 * - `apt-brew` — install via `apt-get` or `brew` (fallback)
 * - `apt-snap` — install via `apt-get` or `snap` (fallback)
 * - `pip-apt` — install via `pip3` or `apt-get` (fallback)
 * - `apt-keys` — install via apt with custom repo keyring (gh, terraform)
 * - `verified` — install via the verified_install() shell function
 */
export type ToolInstallStrategy =
  | "npm"
  | "apt"
  | "apt-brew"
  | "apt-snap"
  | "pip-apt"
  | "apt-keys"
  | "verified";

export interface ToolDefinition {
  /** Stable identifier used as key in records and shell markers (e.g. "gh", "azDo") */
  id: string;
  /** Binary name checked by `command -v` on the remote VM */
  binary: string;
  /** Install strategy determining which shell template to use */
  strategy: ToolInstallStrategy;
  /** Key into NPM_PACKAGES for npm-strategy tools */
  npmKey?: string;
  /** Short log file suffix used in error logs (e.g. "gh", "az") */
  logSuffix: string;
  /**
   * Category for UI grouping in the renderer.
   * Must match the ServiceCategory values in AddVmWizard.tsx.
   */
  category: "ai" | "platform" | "devops" | "networking" | "utilities";
  /** i18n key for the service name (e.g. "vmWizard.serviceGh") */
  nameKey: string;
  /** i18n key for the service description */
  descKey: string;
}

/**
 * All optional tools that can be installed on a remote VM.
 * Order determines the install sequence and UI display order.
 */
export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  // AI
  {
    id: "openCode",
    binary: "opencode",
    strategy: "npm",
    npmKey: "openCode",
    logSuffix: "oc",
    category: "ai",
    nameKey: "vmWizard.serviceOpenCode",
    descKey: "vmWizard.serviceOpenCodeDesc",
  },
  {
    id: "claude",
    binary: "claude",
    strategy: "npm",
    npmKey: "claude",
    logSuffix: "claude",
    category: "ai",
    nameKey: "vmWizard.serviceClaudeCli",
    descKey: "vmWizard.serviceClaudeCliDesc",
  },
  // Platform CLIs
  {
    id: "gh",
    binary: "gh",
    strategy: "apt-keys",
    logSuffix: "gh",
    category: "platform",
    nameKey: "vmWizard.serviceGh",
    descKey: "vmWizard.serviceGhDesc",
  },
  {
    id: "azDo",
    binary: "az",
    strategy: "pip-apt",
    logSuffix: "az",
    category: "platform",
    nameKey: "vmWizard.serviceAzDo",
    descKey: "vmWizard.serviceAzDoDesc",
  },
  {
    id: "jira",
    binary: "acli",
    strategy: "npm",
    npmKey: "jira",
    logSuffix: "jira",
    category: "platform",
    nameKey: "vmWizard.serviceJira",
    descKey: "vmWizard.serviceJiraDesc",
  },
  {
    id: "gitlab",
    binary: "glab",
    strategy: "npm",
    npmKey: "gitlab",
    logSuffix: "glab",
    category: "platform",
    nameKey: "vmWizard.serviceGitlab",
    descKey: "vmWizard.serviceGitlabDesc",
  },
  // DevOps / Infra
  {
    id: "docker",
    binary: "docker",
    strategy: "apt-snap",
    logSuffix: "docker",
    category: "devops",
    nameKey: "vmWizard.serviceDocker",
    descKey: "vmWizard.serviceDockerDesc",
  },
  {
    id: "terraform",
    binary: "terraform",
    strategy: "apt-brew",
    logSuffix: "tf",
    category: "devops",
    nameKey: "vmWizard.serviceTerraform",
    descKey: "vmWizard.serviceTerraformDesc",
  },
  // Networking
  {
    id: "tailscale",
    binary: "tailscale",
    strategy: "verified",
    logSuffix: "tailscale",
    category: "networking",
    nameKey: "vmWizard.serviceTailscale",
    descKey: "vmWizard.serviceTailscaleDesc",
  },
  // Utilities
  {
    id: "jq",
    binary: "jq",
    strategy: "apt",
    logSuffix: "jq",
    category: "utilities",
    nameKey: "vmWizard.serviceJq",
    descKey: "vmWizard.serviceJqDesc",
  },
  {
    id: "ripgrep",
    binary: "rg",
    strategy: "apt",
    logSuffix: "rg",
    category: "utilities",
    nameKey: "vmWizard.serviceRipgrep",
    descKey: "vmWizard.serviceRipgrepDesc",
  },
] as const;

/** Lookup a tool definition by its id */
export function getToolDef(id: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.id === id);
}
