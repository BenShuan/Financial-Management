import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Local data directory (vault + config). Lives in the OS user's app-data folder, never in the repo.
 * Override with FM_BANK_SYNC_DIR (used by tests).
 */
export function dataDir(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
  if (env.FM_BANK_SYNC_DIR) return env.FM_BANK_SYNC_DIR;
  if (platform === "win32") return join(env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "fm-bank-sync");
  if (platform === "darwin") return join(homedir(), "Library", "Application Support", "fm-bank-sync");
  return join(env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "fm-bank-sync");
}

export const VAULT_FILE = "vault.enc.json";
export const CONFIG_FILE = "config.json";
