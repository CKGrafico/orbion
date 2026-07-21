import { describe, it, expect, afterAll } from "vitest";
import net from "node:net";
import { checkLocalPort } from "../src/main/ssh-tunnel.js";

let testServer: net.Server | null = null;
let testPort = 0;

function startTestServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        testServer = server;
        testPort = addr.port;
        resolve(addr.port);
      } else {
        reject(new Error("Failed to get server address"));
      }
    });
    server.on("error", reject);
  });
}

afterAll(() => {
  testServer?.close();
});

describe("checkLocalPort", () => {
  it("returns true when a server is listening on the port", async () => {
    const port = await startTestServer();
    const result = await checkLocalPort(port, 1000);
    expect(result).toBe(true);
  });

  it("returns false when no server is listening on the port", async () => {
    const result = await checkLocalPort(59999, 500);
    expect(result).toBe(false);
  });

  it("returns false on a port that refuses connections", async () => {
    const result = await checkLocalPort(1, 500);
    expect(result).toBe(false);
  });
});
