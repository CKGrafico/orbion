export interface ChainStep {
  taskId: string;
  taskName: string;
  command: string;
  commandArgs: string[];
  onSuccessTaskId: string | null;
  onFailureTaskId: string | null;
}

export interface LoopShape {
  loopId: string;
  environmentId: string;
  command: string;
  commandArgs: string[];
  intervalHuman: string;
  projectId: string | undefined;
  taskId: string | null;
  chainSteps: ChainStep[];
  cachedAt: number;
}

export interface LoopShapeCacheBridge {
  getCached: (environmentId: string) => Promise<LoopShape[]>;
  getAll: () => Promise<LoopShape[]>;
  refresh: (environmentId: string) => Promise<LoopShape[]>;
  onUpdate: (cb: (shapes: LoopShape[]) => void) => () => void;
}
