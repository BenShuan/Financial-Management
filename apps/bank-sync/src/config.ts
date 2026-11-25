import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type { BankSyncProvider } from "@financial-management/shared";

/** Non-secret local settings (config.json in the data dir). Never holds credentials or tokens. */
const isoOptional = z.string().datetime({ offset: true }).optional();

export const configSchema = z.object({
  apiOrigin: z.string().default(""),
  lookbackDays: z.number().int().min(1).max(365).default(90),
  overlapDays: z.number().int().min(0).max(60).default(14),
  /** Per-provider cursor; advances only after a fully successful provider sync. */
  lastSuccessfulSyncAt: z
    .object({ discount: isoOptional, isracard: isoOptional, max: isoOptional })
    .default({}),
});
export type Config = z.infer<typeof configSchema>;

export class ConfigStore {
  constructor(readonly filePath: string) {}

  async load(): Promise<Config> {
    try {
      const raw = JSON.parse(await readFile(this.filePath, "utf8")) as unknown;
      const parsed = configSchema.safeParse(raw);
      if (parsed.success) return parsed.data;
    } catch {
      // missing or unreadable: fall back to defaults
    }
    return configSchema.parse({});
  }

  async save(config: Config): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await writeFile(tmp, JSON.stringify(configSchema.parse(config), null, 2));
    await rename(tmp, this.filePath);
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** First run: now - lookbackDays. Later: last success - overlapDays (dedupe makes overlap safe). */
export function computeStartDate(config: Config, provider: BankSyncProvider, now: Date): Date {
  const last = config.lastSuccessfulSyncAt[provider];
  if (last) return new Date(new Date(last).getTime() - config.overlapDays * DAY_MS);
  return new Date(now.getTime() - config.lookbackDays * DAY_MS);
}
