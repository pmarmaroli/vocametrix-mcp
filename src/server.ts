#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "./client.js";
import { registerAllTools } from "./tools/index.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";

const server = new McpServer({
  name: "vocametrix",
  version: "0.1.0",
});

let client;
try {
  client = createClient();
} catch (err) {
  console.error("[vocametrix-mcp] Startup error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
}

registerAllTools(server, client);
registerResources(server);
registerPrompts(server);

const transport = new StdioServerTransport();
await server.connect(transport);
