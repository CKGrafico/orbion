import { injectable } from "inversify-hooks";
import type { ISiblingOfferService } from "../interfaces";

@injectable()
export class SiblingOfferService implements ISiblingOfferService {
  async isDeclined(environmentId: string, loopId: string, fingerprint: string): Promise<boolean> {
    if (!window.api) return false;
    return window.api.siblingDecline.isDeclined(environmentId, loopId, fingerprint);
  }

  async recordDecline(environmentId: string, loopId: string, fingerprint: string): Promise<void> {
    if (!window.api) return;
    await window.api.siblingDecline.recordDecline({ environmentId, loopId, fingerprint });
  }
}
