import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Find a locally installed Chrome or Edge (israeli-bank-scrapers-core uses puppeteer-core and
 * downloads no browser). FM_BROWSER_PATH overrides the search.
 */
export function browserCandidates(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string[] {
  if (platform === "win32") {
    const roots = [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA].filter((r): r is string => !!r);
    return roots.flatMap((r) => [
      join(r, "Google", "Chrome", "Application", "chrome.exe"),
      join(r, "Microsoft", "Edge", "Application", "msedge.exe"),
    ]);
  }
  if (platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
  }
  return [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
  ];
}

export function findBrowser(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  exists: (p: string) => boolean = existsSync,
): string | null {
  if (env.FM_BROWSER_PATH) return exists(env.FM_BROWSER_PATH) ? env.FM_BROWSER_PATH : null;
  return browserCandidates(env, platform).find((p) => exists(p)) ?? null;
}
