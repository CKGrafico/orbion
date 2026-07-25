/** Node.js binary resolution: 1) PATH `node` via `command -v`, 2) version-manager dirs (nvm/fnm/asdf/mise/volta) → latest semver.
 *  IMPORTANT: omits `set -e` so the caller controls error-handling semantics. */
export const NODE_RESOLVE_SCRIPT = `
node_path=""
if command -v node >/dev/null 2>&1; then
  node_path="$(command -v node)"
fi

for manager_dir in \\
  "\${HOME}/.nvm/versions/node" \\
  "\${HOME}/.local/share/fnm/node-versions" \\
  "\${HOME}/.asdf/installs/nodejs" \\
  "\${HOME}/.local/share/mise/installs/node" \\
  "\${HOME}/.volta/tools/node"; do
  if [ -d "\${manager_dir}" ]; then
    latest="\$(find "\${manager_dir}" -maxdepth 4 -name 'node' -path '*/bin/node' 2>/dev/null | sort -V | tail -1)"
    if [ -n "\${latest}" ]; then
      node_path="\${latest}"
      break
    fi
  fi
done`;
