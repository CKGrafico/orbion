export interface SecurityAuditEvent {
  id: string;
  timestamp: string;
  kind: string;
  environmentId: string;
  credentialKind: "sessionToken" | "sshKeyPassphrase";
  detail?: string;
}

export interface CredentialBridge {
  onTampered: (cb: (event: { environmentId: string; credentialKind: "sessionToken" | "sshKeyPassphrase" }) => void) => () => void;
  getSecurityAuditEvents: () => Promise<SecurityAuditEvent[]>;
}
