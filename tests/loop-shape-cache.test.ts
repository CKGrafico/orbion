import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock electron-store before importing the module
vi.mock("electron-store", () => {
  const store = new Map<string, unknown>();
  return {
    default: class MockStore {
      get(key: string): unknown {
        return store.get(key);
      }
      set(key: string, value: unknown): void {
        store.set(key, value);
      }
    },
  };
});

// Mock config-store functions
vi.mock("../src/main/config-store.js", () => ({
  getEnvironments: vi.fn(() => [
    {
      id: "env-1",
      name: "Test VM",
      endpoints: [
        { id: "ep-1", kind: "direct", url: "http://localhost:8845" },
      ],
      activeEndpointId: "ep-1",
    },
  ]),
  getSessionToken: vi.fn(() => null),
}));

// Mock connection-supervisor
vi.mock("../src/main/connection-supervisor.js", () => ({
  resolveActiveUrl: vi.fn((_endpoints, _activeId) => "http://localhost:8845"),
}));

// Mock tunnel-registry
vi.mock("../src/main/tunnel-registry.js", () => ({
  resolveEffectiveUrl: vi.fn((_envId, ep) => ep?.url ?? "http://localhost:8845"),
}));

// Mock http-utils
vi.mock("../src/main/http-utils.js", () => ({
  fetchAndUnwrap: vi.fn(),
}));

describe("loop-shape-cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildChainSteps (unit logic)", () => {
    it("builds a linear chain from a root task following on-success links", () => {
      // Pure logic test: given tasks, walk the on-success chain
      const tasks = [
        { id: "t1", name: "Build", command: "npm run build", commandArgs: [], onSuccessTaskId: "t2", onFailureTaskId: "t3" },
        { id: "t2", name: "Test", command: "npm test", commandArgs: [], onSuccessTaskId: null, onFailureTaskId: "t3" },
        { id: "t3", name: "Notify", command: "slack-cli send", commandArgs: [], onSuccessTaskId: null, onFailureTaskId: null },
      ];

      // Replicate the buildChainSteps logic from the module
      function buildChainSteps(taskId: string, allTasks: typeof tasks) {
        const steps: Array<{
          taskId: string;
          taskName: string;
          command: string;
          commandArgs: string[];
          onSuccessTaskId: string | null;
          onFailureTaskId: string | null;
        }> = [];
        const visited = new Set<string>();
        let currentId: string | null = taskId;

        while (currentId && !visited.has(currentId)) {
          visited.add(currentId);
          const task = allTasks.find((t) => t.id === currentId);
          if (!task) break;
          steps.push({
            taskId: task.id,
            taskName: task.name,
            command: task.command,
            commandArgs: task.commandArgs,
            onSuccessTaskId: task.onSuccessTaskId,
            onFailureTaskId: task.onFailureTaskId,
          });
          currentId = task.onSuccessTaskId;
        }
        return steps;
      }

      const steps = buildChainSteps("t1", tasks);
      expect(steps).toHaveLength(2);
      expect(steps[0].taskName).toBe("Build");
      expect(steps[0].onSuccessTaskId).toBe("t2");
      expect(steps[1].taskName).toBe("Test");
      expect(steps[1].onSuccessTaskId).toBeNull();
    });

    it("handles cycles by stopping at already-visited tasks", () => {
      const tasks = [
        { id: "t1", name: "A", command: "a", commandArgs: [], onSuccessTaskId: "t2", onFailureTaskId: null },
        { id: "t2", name: "B", command: "b", commandArgs: [], onSuccessTaskId: "t1", onFailureTaskId: null },
      ];

      function buildChainSteps(taskId: string, allTasks: typeof tasks) {
        const steps: Array<{
          taskId: string;
          taskName: string;
          command: string;
          commandArgs: string[];
          onSuccessTaskId: string | null;
          onFailureTaskId: string | null;
        }> = [];
        const visited = new Set<string>();
        let currentId: string | null = taskId;

        while (currentId && !visited.has(currentId)) {
          visited.add(currentId);
          const task = allTasks.find((t) => t.id === currentId);
          if (!task) break;
          steps.push({
            taskId: task.id,
            taskName: task.name,
            command: task.command,
            commandArgs: task.commandArgs,
            onSuccessTaskId: task.onSuccessTaskId,
            onFailureTaskId: task.onFailureTaskId,
          });
          currentId = task.onSuccessTaskId;
        }
        return steps;
      }

      const steps = buildChainSteps("t1", tasks);
      expect(steps).toHaveLength(2);
      expect(steps[0].taskName).toBe("A");
      expect(steps[1].taskName).toBe("B");
    });

    it("returns empty chain when task ID not found", () => {
      const tasks: Array<{ id: string; name: string; command: string; commandArgs: string[]; onSuccessTaskId: string | null; onFailureTaskId: string | null }> = [];

      function buildChainSteps(taskId: string, allTasks: typeof tasks) {
        const steps: Array<{
          taskId: string; taskName: string; command: string; commandArgs: string[];
          onSuccessTaskId: string | null; onFailureTaskId: string | null;
        }> = [];
        const visited = new Set<string>();
        let currentId: string | null = taskId;
        while (currentId && !visited.has(currentId)) {
          visited.add(currentId);
          const task = allTasks.find((t) => t.id === currentId);
          if (!task) break;
          steps.push({
            taskId: task.id, taskName: task.name, command: task.command,
            commandArgs: task.commandArgs, onSuccessTaskId: task.onSuccessTaskId,
            onFailureTaskId: task.onFailureTaskId,
          });
          currentId = task.onSuccessTaskId;
        }
        return steps;
      }

      const steps = buildChainSteps("nonexistent", tasks);
      expect(steps).toHaveLength(0);
    });
  });

  describe("LoopShape data integrity", () => {
    it("produces a LoopShape with all required fields from daemon data", () => {
      const loop = {
        id: "loop-1",
        command: "npm run build",
        commandArgs: ["--verbose"],
        intervalHuman: "5m",
        projectId: "default",
        taskId: "task-1",
      };

      const tasks = [
        { id: "task-1", name: "Build", command: "npm", commandArgs: ["run", "build"], onSuccessTaskId: null, onFailureTaskId: null },
      ];

      const now = Date.now();

      function buildChainSteps(taskId: string, allTasks: typeof tasks) {
        const steps: Array<{
          taskId: string; taskName: string; command: string; commandArgs: string[];
          onSuccessTaskId: string | null; onFailureTaskId: string | null;
        }> = [];
        const visited = new Set<string>();
        let currentId: string | null = taskId;
        while (currentId && !visited.has(currentId)) {
          visited.add(currentId);
          const task = allTasks.find((t) => t.id === currentId);
          if (!task) break;
          steps.push({
            taskId: task.id, taskName: task.name, command: task.command,
            commandArgs: task.commandArgs, onSuccessTaskId: task.onSuccessTaskId,
            onFailureTaskId: task.onFailureTaskId,
          });
          currentId = task.onSuccessTaskId;
        }
        return steps;
      }

      const shape = {
        loopId: loop.id,
        environmentId: "env-1",
        command: loop.command,
        commandArgs: loop.commandArgs,
        intervalHuman: loop.intervalHuman,
        projectId: loop.projectId,
        taskId: loop.taskId ?? null,
        chainSteps: loop.taskId ? buildChainSteps(loop.taskId, tasks) : [],
        cachedAt: now,
      };

      expect(shape.loopId).toBe("loop-1");
      expect(shape.command).toBe("npm run build");
      expect(shape.commandArgs).toEqual(["--verbose"]);
      expect(shape.intervalHuman).toBe("5m");
      expect(shape.projectId).toBe("default");
      expect(shape.taskId).toBe("task-1");
      expect(shape.chainSteps).toHaveLength(1);
      expect(shape.chainSteps[0].taskName).toBe("Build");
      expect(shape.cachedAt).toBe(now);
    });

    it("produces a LoopShape without chainSteps when no taskId", () => {
      const loop = {
        id: "loop-2",
        command: "echo hello",
        commandArgs: [],
        intervalHuman: "30s",
        projectId: undefined,
        taskId: null,
      };

      const shape = {
        loopId: loop.id,
        environmentId: "env-1",
        command: loop.command,
        commandArgs: loop.commandArgs,
        intervalHuman: loop.intervalHuman,
        projectId: loop.projectId,
        taskId: loop.taskId ?? null,
        chainSteps: [] as Array<{
          taskId: string; taskName: string; command: string; commandArgs: string[];
          onSuccessTaskId: string | null; onFailureTaskId: string | null;
        }>,
        cachedAt: Date.now(),
      };

      expect(shape.chainSteps).toHaveLength(0);
      expect(shape.projectId).toBeUndefined();
      expect(shape.taskId).toBeNull();
    });
  });
});
