import { cid, container } from "inversify-hooks";
import { addIdToCache } from "inversify-props";
import type { IConfigService, IConnectionService, IOpenCodeService, IVmWizardService, IInfraService, IApiService, IStreamService, ITailscaleService, INotificationService, IBudgetService, IInboxService, IOutageService, IReachabilityService, ITranscriptService, IMcpService, IAgentService, ILoopShapeCacheService, ISiblingOfferService, IPrPollingService, IPrVerdictService, IReviewModeService, ILogService } from "./interfaces";
import { ConfigService } from "./impl/ConfigService";
import { ConnectionService } from "./impl/ConnectionService";
import { OpenCodeService } from "./impl/OpenCodeService";
import { VmWizardService } from "./impl/VmWizardService";
import { InfraService } from "./impl/InfraService";
import { ApiService, StreamService, TailscaleService } from "./impl/ApiStreamTailscale";
import { NotificationService } from "./impl/NotificationService";
import { LogService } from "./impl/LogService";
import { BudgetService } from "./impl/BudgetService";
import { InboxService } from "./impl/InboxService";
import { OutageService } from "./impl/OutageService";
import { ReachabilityService } from "./impl/ReachabilityService";
import { TranscriptService } from "./impl/TranscriptService";
import { McpService } from "./impl/McpService";
import { AgentService } from "./impl/AgentService";
import { LoopShapeCacheService } from "./impl/LoopShapeCacheService";
import { SiblingOfferService } from "./impl/SiblingOfferService";
import { PrPollingService } from "./impl/PrPollingService";
import { PrVerdictService } from "./impl/PrVerdictService";
import { ReviewModeService } from "./impl/ReviewModeService";
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
  MockReachabilityService,
  MockTranscriptService,
  MockMcpService,
  MockAgentService,
  MockLoopShapeCacheService,
  MockSiblingOfferService,
  MockPrPollingService,
  MockPrVerdictService,
  MockReviewModeService,
  MockLogService,
} from "./mock/MockServices";

let built = false;

/** Pre-populate the cid cache with string IDs for every service interface.
 *  Under Vite's dev server + esbuild, the @injectable() decorator may not
 *  run before addSingleton is called, leaving cid.IXxx = undefined.
 *  Registering explicit string IDs here ensures the container always has
 *  valid identifiers. */
function ensureCidIds(): void {
  const ids = [
    "IConfigService",
    "IConnectionService",
    "IOpenCodeService",
    "IVmWizardService",
    "IInfraService",
    "IApiService",
    "IStreamService",
    "ITailscaleService",
    "INotificationService",
    "IBudgetService",
    "IInboxService",
    "IOutageService",
    "IReachabilityService",
    "ITranscriptService",
    "IMcpService",
    "IAgentService",
    "ILoopShapeCacheService",
    "ISiblingOfferService",
    "IPrPollingService",
    "IPrVerdictService",
    "IReviewModeService",
    "ILogService",
  ];
  for (const id of ids) {
    if (!(cid as Record<string, unknown>)[id]) {
      addIdToCache(id, id);
    }
  }
}

export function buildContainer(): void {
  if (built) return;
  built = true;

  ensureCidIds();

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
    container.addSingleton<IReachabilityService>(ReachabilityService, cid.IReachabilityService);
    container.addSingleton<ITranscriptService>(TranscriptService, cid.ITranscriptService);
    container.addSingleton<IMcpService>(McpService, cid.IMcpService);
    container.addSingleton<IAgentService>(AgentService, cid.IAgentService);
    container.addSingleton<ILoopShapeCacheService>(LoopShapeCacheService, cid.ILoopShapeCacheService);
    container.addSingleton<ISiblingOfferService>(SiblingOfferService, cid.ISiblingOfferService);
    container.addSingleton<IPrPollingService>(PrPollingService, cid.IPrPollingService);
    container.addSingleton<IPrVerdictService>(PrVerdictService, cid.IPrVerdictService);
    container.addSingleton<IReviewModeService>(ReviewModeService, cid.IReviewModeService);
    container.addSingleton<ILogService>(LogService, cid.ILogService);
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
    container.addSingleton<IReachabilityService>(MockReachabilityService, cid.IReachabilityService);
    container.addSingleton<ITranscriptService>(MockTranscriptService, cid.ITranscriptService);
    container.addSingleton<IMcpService>(MockMcpService, cid.IMcpService);
    container.addSingleton<IAgentService>(MockAgentService, cid.IAgentService);
    container.addSingleton<ILoopShapeCacheService>(MockLoopShapeCacheService, cid.ILoopShapeCacheService);
    container.addSingleton<ISiblingOfferService>(MockSiblingOfferService, cid.ISiblingOfferService);
    container.addSingleton<IPrPollingService>(MockPrPollingService, cid.IPrPollingService);
    container.addSingleton<IPrVerdictService>(MockPrVerdictService, cid.IPrVerdictService);
    container.addSingleton<IReviewModeService>(MockReviewModeService, cid.IReviewModeService);
    container.addSingleton<ILogService>(MockLogService, cid.ILogService);
  }
}
