/** Single source of truth for all optional VM tools. Adding a new tool: 1) add entry to
 *  TOOL_DEFINITIONS, 2) add install logic in `generateInstallBlock()` (ssh-launch.ts).
 *  No other files need changes. @see https://github.com/orbion/orbion/issues/52 */

export type ToolInstallStrategy =
  | "npm"
  | "apt"
  | "apt-brew"
  | "apt-snap"
  | "pip-apt"
  | "apt-keys"
  | "verified";

export interface ToolDefinition {
  id: string;
  binary: string;
  strategy: ToolInstallStrategy;
  npmKey?: string;
  logSuffix: string;
  category: "ai" | "platform" | "devops" | "networking" | "utilities";
  nameKey: string;
  descKey: string;
}

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  { id: "openCode", binary: "opencode", strategy: "npm", npmKey: "openCode", logSuffix: "oc", category: "ai", nameKey: "vmWizard.serviceOpenCode", descKey: "vmWizard.serviceOpenCodeDesc" },
  { id: "claude", binary: "claude", strategy: "npm", npmKey: "claude", logSuffix: "claude", category: "ai", nameKey: "vmWizard.serviceClaudeCli", descKey: "vmWizard.serviceClaudeCliDesc" },
  { id: "gh", binary: "gh", strategy: "apt-keys", logSuffix: "gh", category: "platform", nameKey: "vmWizard.serviceGh", descKey: "vmWizard.serviceGhDesc" },
  { id: "azDo", binary: "az", strategy: "pip-apt", logSuffix: "az", category: "platform", nameKey: "vmWizard.serviceAzDo", descKey: "vmWizard.serviceAzDoDesc" },
  { id: "jira", binary: "acli", strategy: "npm", npmKey: "jira", logSuffix: "jira", category: "platform", nameKey: "vmWizard.serviceJira", descKey: "vmWizard.serviceJiraDesc" },
  { id: "gitlab", binary: "glab", strategy: "npm", npmKey: "gitlab", logSuffix: "glab", category: "platform", nameKey: "vmWizard.serviceGitlab", descKey: "vmWizard.serviceGitlabDesc" },
  { id: "docker", binary: "docker", strategy: "apt-snap", logSuffix: "docker", category: "devops", nameKey: "vmWizard.serviceDocker", descKey: "vmWizard.serviceDockerDesc" },
  { id: "terraform", binary: "terraform", strategy: "apt-brew", logSuffix: "tf", category: "devops", nameKey: "vmWizard.serviceTerraform", descKey: "vmWizard.serviceTerraformDesc" },
  { id: "tailscale", binary: "tailscale", strategy: "verified", logSuffix: "tailscale", category: "networking", nameKey: "vmWizard.serviceTailscale", descKey: "vmWizard.serviceTailscaleDesc" },
  { id: "jq", binary: "jq", strategy: "apt", logSuffix: "jq", category: "utilities", nameKey: "vmWizard.serviceJq", descKey: "vmWizard.serviceJqDesc" },
  { id: "ripgrep", binary: "rg", strategy: "apt", logSuffix: "rg", category: "utilities", nameKey: "vmWizard.serviceRipgrep", descKey: "vmWizard.serviceRipgrepDesc" },
] as const;

export function getToolDef(id: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.id === id);
}
