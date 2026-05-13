import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { homedir, platform } from "os";

const IS_WIN = platform() === "win32";
const IS_MAC = platform() === "darwin";

interface ClientDef {
  name: string;
  configPath: string;
  format: "mcpServers" | "vscode";
  serverEntry: (key: string) => Record<string, unknown>;
}

function claudeEntry(key: string): Record<string, unknown> {
  return IS_WIN
    ? { command: "cmd", args: ["/c", "npx", "-y", "@vocametrix/mcp-server"], env: { VOCAMETRIX_API_KEY: key } }
    : { command: "npx", args: ["-y", "@vocametrix/mcp-server"], env: { VOCAMETRIX_API_KEY: key } };
}

function vscodeEntry(key: string): Record<string, unknown> {
  return { type: "stdio", command: "npx", args: ["-y", "@vocametrix/mcp-server"], env: { VOCAMETRIX_API_KEY: key } };
}

function getClients(): ClientDef[] {
  const home = homedir();
  const appData = process.env["APPDATA"] ?? join(home, "AppData", "Roaming");
  const configHome = process.env["XDG_CONFIG_HOME"] ?? join(home, ".config");

  const claudePath = IS_WIN
    ? join(appData, "Claude", "claude_desktop_config.json")
    : IS_MAC
    ? join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
    : join(configHome, "Claude", "claude_desktop_config.json");

  const vscodePath = IS_WIN
    ? join(appData, "Code", "User", "settings.json")
    : IS_MAC
    ? join(home, "Library", "Application Support", "Code", "User", "settings.json")
    : join(configHome, "Code", "User", "settings.json");

  const vscodiumPath = IS_WIN
    ? join(appData, "VSCodium", "User", "settings.json")
    : IS_MAC
    ? join(home, "Library", "Application Support", "VSCodium", "User", "settings.json")
    : join(configHome, "VSCodium", "User", "settings.json");

  const cursorPath = IS_WIN
    ? join(home, ".cursor", "mcp.json")
    : join(home, ".cursor", "mcp.json");

  const windsurfPath = IS_WIN
    ? join(appData, "Windsurf", "User", "settings.json")
    : IS_MAC
    ? join(home, "Library", "Application Support", "Windsurf", "User", "settings.json")
    : join(configHome, "Windsurf", "User", "settings.json");

  return [
    { name: "Claude Desktop", configPath: claudePath, format: "mcpServers", serverEntry: claudeEntry },
    { name: "Cursor",         configPath: cursorPath,   format: "mcpServers", serverEntry: claudeEntry },
    { name: "VS Code",        configPath: vscodePath,   format: "vscode",     serverEntry: vscodeEntry },
    { name: "VSCodium",       configPath: vscodiumPath, format: "vscode",     serverEntry: vscodeEntry },
    { name: "Windsurf",       configPath: windsurfPath, format: "vscode",     serverEntry: vscodeEntry },
  ];
}

function readJson(filePath: string): Record<string, unknown> {
  try { return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>; }
  catch { return {}; }
}

function writeJson(filePath: string, data: Record<string, unknown>): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function configureClient(client: ClientDef, key: string): boolean {
  const config = readJson(client.configPath);

  if (client.format === "mcpServers") {
    if (!config["mcpServers"]) config["mcpServers"] = {};
    (config["mcpServers"] as Record<string, unknown>)["vocametrix"] = client.serverEntry(key);
  } else {
    if (!config["mcp"]) config["mcp"] = {};
    const mcp = config["mcp"] as Record<string, unknown>;
    if (!mcp["servers"]) mcp["servers"] = {};
    (mcp["servers"] as Record<string, unknown>)["vocametrix"] = client.serverEntry(key);
  }

  writeJson(client.configPath, config);
  return true;
}

export function runSetup(key: string): void {
  console.error("\n🔧 Vocametrix MCP Setup\n");

  const clients = getClients();
  const detected = clients.filter(c => existsSync(dirname(c.configPath)));

  if (detected.length === 0) {
    console.error("No supported MCP clients found on this machine.");
    console.error("Supported: Claude Desktop, Cursor, VS Code, VSCodium, Windsurf\n");
    process.exit(1);
  }

  let configured = 0;
  for (const client of detected) {
    try {
      configureClient(client, key);
      console.error(`✓ ${client.name} — ${client.configPath}`);
      configured++;
    } catch (err) {
      console.error(`✗ ${client.name} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (configured > 0) {
    console.error(`\n✅ Done! Restart ${detected.map(c => c.name).join(", ")} to activate Vocametrix.\n`);
  }
}
