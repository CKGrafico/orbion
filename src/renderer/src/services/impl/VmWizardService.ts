import { injectable } from "inversify-hooks";
import type { SshHost, VmWizardProgress, VmWizardResult, VmWizardServiceSelection } from "../../../../shared/ipc";
import type { IVmWizardService } from "../interfaces";

@injectable()
export class VmWizardService implements IVmWizardService {
  private get api() {
    return window.api!.vmWizard;
  }

  async listSshHosts(): Promise<SshHost[]> {
    return this.api.listSshHosts();
  }
  async startWizard(target: string, name?: string): Promise<VmWizardResult> {
    return this.api.startWizard(target, name);
  }
  onProgress(cb: (progress: VmWizardProgress) => void): () => void {
    return this.api.onProgress(cb);
  }
  cancelWizard(): void {
    return this.api.cancelWizard();
  }
  respondConsent(decision: "install" | "skip"): void {
    return this.api.respondConsent(decision);
  }
  respondServiceSelection(selection: VmWizardServiceSelection): void {
    return this.api.respondServiceSelection(selection);
  }
}
