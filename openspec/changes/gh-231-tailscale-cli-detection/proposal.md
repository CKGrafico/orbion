# gh-231-tailscale-cli-detection

Fix Tailscale CLI availability being cached forever. The RuntimeHealthChip component
now re-checks CLI availability on focus/mount rather than caching the first result
for the entire session. This is a visible UI state change — the chip reflects the
current runtime availability state and updates without app restart.
