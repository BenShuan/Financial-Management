import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { createApiClient } from "./api.js";
import { ConfigStore } from "./config.js";
import { CONFIG_FILE, VAULT_FILE, dataDir } from "./paths.js";
import { defaultScrape } from "./scrape.js";
import { createLocalApp } from "./server.js";
import { SyncRunner } from "./sync.js";
import { Vault } from "./vault.js";

const MIN_NODE = [22, 22, 2] as const;

export function nodeVersionOk(version: string = process.versions.node): boolean {
  const parts = version.split(".").map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const a = parts[i] ?? 0;
    const b = MIN_NODE[i] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
}

function openBrowser(url: string): void {
  const [cmd, args]: [string, string[]] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", '""', url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true, windowsVerbatimArguments: process.platform === "win32" }).unref();
  } catch {
    // the URL is printed anyway
  }
}

function main(): void {
  if (!nodeVersionOk()) {
    console.error(`נדרשת גרסת Node ${MIN_NODE.join(".")} ומעלה (Node >= ${MIN_NODE.join(".")} required). Current: ${process.versions.node}`);
    process.exit(1);
  }

  const dir = dataDir();
  const vault = new Vault(join(dir, VAULT_FILE));
  const configStore = new ConfigStore(join(dir, CONFIG_FILE));
  const runner = new SyncRunner({
    vault,
    configStore,
    scrape: defaultScrape,
    apiFactory: (origin, token) => createApiClient(fetch, origin, token),
  });
  const launchToken = randomBytes(24).toString("base64url");
  let port = Number(process.env.FM_SYNC_PORT ?? 5199);
  const app = createLocalApp({ launchToken, getPort: () => port, vault, configStore, runner });

  const start = (attempt: number) => {
    const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port }, (info) => {
      port = info.port;
      const url = `http://127.0.0.1:${port}/?t=${launchToken}`;
      // The per-launch token is shown once here so the user can reopen the page; nothing else is logged.
      console.log(`FM bank sync is running locally. Open: ${url}`);
      console.log(`נתוני הכספת וההגדרות נשמרים ב: ${dir}`);
      openBrowser(url);
    });
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && attempt === 0) {
        port = 0; // let the OS pick a free port
        start(1);
        return;
      }
      console.error("Failed to start local server:", err.code ?? "unknown");
      process.exit(1);
    });
  };
  start(0);

  const shutdown = () => {
    vault.lock();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
