import { cid, container } from "inversify-hooks";
import type { IConfigService, IConnectionService, IOpenCodeService, IVmWizardService, IInfraService, IApiService, IStreamService, ITailscaleService, INotificationService, IBudgetService, IInboxService, IOutageService } from "./interfaces";
import { ConfigService } from "./impl/ConfigService";
import { ConnectionService } from "./impl/ConnectionService";
import { OpenCodeService } from "./impl/OpenCodeService";
import { VmWizardService } from "./impl/VmWizardService";
import { InfraService } from "./impl/InfraService";
import { ApiService, StreamService, TailscaleService } from "./impl/ApiStreamTailscale";
import { NotificationService } from "./impl/NotificationService";
import { BudgetService } from "./impl/BudgetService";
import { InboxService } from "./impl/InboxService";
import { OutageService } from "./impl/OutageService";
import {
  MockConfigService,
  MockConnectionService,
  MockOpenCodeService,
  MockVmWizardService,
  MockInfraService,
  MockApiService,
  MockStreamService,
  MockTailscaleService,
  MockNotificationService,
  MockBudgetService,
  MockInboxService,
  MockOutageService,
} from "./mock/MockServices";

let built = false;

export function buildContainer(): void {
  if (built) return;
  built = true;

  const isElectron = typeof window !== "undefined" && !!window.api;

  if (isElectron) {
    container.addSingleton<IConfigService>(ConfigService, cid.IConfigService);
    container.addSingleton<IConnectionService>(ConnectionService, cid.IConnectionService);
    container.addSingleton<IOpenCodeService>(OpenCodeService, cid.IOpenCodeService);
    container.addSingleton<IVmWizardService>(VmWizardService, cid.IVmWizardService);
    container.addSingleton<IInfraService>(InfraService, cid.IInfraService);
    container.addSingleton<IApiService>(ApiService, cid.IApiService);
    container.addSingleton<IStreamService>(StreamService, cid.IStreamService);
    container.addSingleton<ITailscaleService>(TailscaleService, cid.ITailscaleService);
    container.addSingleton<INotificationService>(NotificationService, cid.INotificationService);
    container.addSingleton<IBudgetService>(BudgetService, cid.IBudgetService);
    container.addSingleton<IInboxService>(InboxService, cid.IInboxService);
    container.addSingleton<IOutageService>(OutageService, cid.IOutageService);
  } else {
    container.addSingleton<IConfigService>(MockConfigService, cid.IConfigService);
    container.addSingleton<IConnectionService>(MockConnectionService, cid.IConnectionService);
    container.addSingleton<IOpenCodeService>(MockOpenCodeService, cid.IOpenCodeService);
    container.addSingleton<IVmWizardService>(MockVmWizardService, cid.IVmWizardService);
    container.addSingleton<IInfraService>(MockInfraService, cid.IInfraService);
    container.addSingleton<IApiService>(MockApiService, cid.IApiService);
    container.addSingleton<IStreamService>(MockStreamService, cid.IStreamService);
    container.addSingleton<ITailscaleService>(MockTailscaleService, cid.ITailscaleService);
    container.addSingleton<INotificationService>(MockNotificationService, cid.INotificationService);
    container.addSingleton<IBudgetService>(MockBudgetService, cid.IBudgetService);
    container.addSingleton<IInboxService>(MockInboxService, cid.IInboxService);
    container.addSingleton<IOutageService>(MockOutageService, cid.IOutageService);
  }
}
