#!/usr/bin/env node
import { createRequire } from "module";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createClient } from "./client.js";
import { registerAllTools } from "./tools/index.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

function buildServer(client: ReturnType<typeof createClient>) {
  const server = new McpServer({ name: "vocametrix", version });
  registerAllTools(server, client);
  registerResources(server);
  registerPrompts(server);
  return server;
}

function createDummyClient(): ReturnType<typeof createClient> {
  const missing = (): never => {
    throw new Error("Vocametrix API key required. Provide your key via the x-api-key header. Get one at https://www.vocametrix.com/registration");
  };
  return { sdk: null as never, apiKey: "", uploadFileId: missing, uploadBlobUrl: missing, get: missing, post: missing };
}

function extractKeyFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const q = url.indexOf("?");
  if (q === -1) return undefined;
  return new URLSearchParams(url.slice(q + 1)).get("key") ?? undefined;
}

async function handleMcpRequest(req: IncomingMessage, res: ServerResponse) {
  const apiKey = (req.headers["x-api-key"] as string | undefined) ?? extractKeyFromUrl(req.url);
  let client: ReturnType<typeof createClient>;
  try {
    client = createClient(apiKey);
  } catch {
    client = createDummyClient();
  }

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const mcpServer = buildServer(client);
  await mcpServer.connect(transport);

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve) => {
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", resolve);
  });

  let body: unknown;
  if (chunks.length > 0) {
    try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { /* non-JSON body */ }
  }

  await transport.handleRequest(req, res, body);
}

const port = process.env.PORT ? parseInt(process.env.PORT) : null;

if (port) {
  const httpServer = createServer((req, res) => {
    const url = req.url ?? "";
    if (url === "/mcp" || url.startsWith("/mcp?")) {
      handleMcpRequest(req, res).catch((err) => {
        console.error("[vocametrix-mcp] Request error:", err);
        if (!res.headersSent) { res.writeHead(500); res.end("Internal server error"); }
      });
    } else if (url === "/" || url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ name: "vocametrix-mcp", version, status: "ok" }));
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  httpServer.listen(port, () => {
    console.error(`[vocametrix-mcp] HTTP server listening on port ${port}`);
  });
} else {
  let client: ReturnType<typeof createClient>;
  try {
    client = createClient();
  } catch (err) {
    console.error("[vocametrix-mcp] Startup error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  const server = buildServer(client!);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
