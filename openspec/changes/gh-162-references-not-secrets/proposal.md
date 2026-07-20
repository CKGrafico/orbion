# gh-162-references-not-secrets

Enforce references-not-secrets in synced config. The serialization layer structurally
cannot include secret fields. The UI component shows only credential references, never
key material. This is a visible state change — restored environments show auth-state
indicators using references instead of secrets.
