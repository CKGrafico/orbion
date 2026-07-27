
export interface BudgetWatch {
  id: string;
  scope: "loop" | "fleet";
  loopId?: string;
  environmentId?: string;
  threshold: number;
  autoPause: boolean;
  enabled: boolean;
  createdAt: string;
}

export interface BudgetBreach {
  id: string;
  watchId: string;
  loopId: string;
  environmentId: string;
  environmentName: string;
  loopDescription: string;
  runsToday: number;
  threshold: number;
  autoPaused: boolean;
  breachedAt: string;
  dismissed: boolean;
}

export interface BudgetBridge {
  getWatches: () => Promise<BudgetWatch[]>;
  addWatch: (watch: Omit<BudgetWatch, "id" | "createdAt">) => Promise<BudgetWatch>;
  removeWatch: (watchId: string) => Promise<void>;
  updateWatch: (watchId: string, updates: Partial<Pick<BudgetWatch, "threshold" | "autoPause" | "enabled">>) => Promise<void>;
  getBreaches: () => Promise<BudgetBreach[]>;
  addBreach: (breach: Omit<BudgetBreach, "id">) => Promise<BudgetBreach>;
  dismissBreach: (breachId: string) => Promise<void>;
}

export type WatchConditionKind =
  | "status-transition"
  | "reachability-change";

export type WatchTarget =
  | { kind: "loop"; loopId: string; environmentId: string }
  | { kind: "instance"; environmentId: string };

export interface WatchCondition {
  kind: WatchConditionKind;
  targetStatus?: string;
  description: string;
}

export interface ConditionWatch {
  id: string;
  target: WatchTarget;
  condition: WatchCondition;
  tripped: boolean;
  createdAt: string;
  trippedAt: string | null;
}

export interface ConditionWatchBridge {
  getWatches: () => Promise<ConditionWatch[]>;
  addWatch: (watch: Omit<ConditionWatch, "id" | "createdAt" | "tripped" | "trippedAt">) => Promise<ConditionWatch>;
  removeWatch: (watchId: string) => Promise<void>;
  tripWatch: (watchId: string) => Promise<void>;
}
