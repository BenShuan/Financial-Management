import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCb } from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { BankSyncProvider } from "@financial-management/shared";

/**
 * Local encrypted vault: scrypt(passphrase) -> AES-256-GCM. The passphrase is never stored and
 * the derived key lives only in memory while unlocked. Each save uses a fresh IV.
 */

export interface VaultSession {
  apiOrigin: string;
  token: string;
  expiresAt: string;
  email: string;
  /** Display-only, as of login time; the live role is re-checked before each sync. */
  displayName?: string;
  householdName?: string;
  role?: string;
}

export interface VaultData {
  session?: VaultSession;
  providers: Partial<Record<BankSyncProvider, Record<string, string>>>;
}

interface VaultFile {
  v: 1;
  kdf: { alg: "scrypt"; N: number; r: number; p: number; salt: string };
  iv: string;
  tag: string;
  ct: string;
}

export type VaultErrorCode = "wrong_passphrase" | "locked" | "exists" | "missing" | "corrupt" | "short_passphrase";

export class VaultError extends Error {
  constructor(readonly code: VaultErrorCode) {
    super(code);
    this.name = "VaultError";
  }
}

export interface KdfParams {
  N: number;
  r: number;
  p: number;
}

const AAD = Buffer.from("fm-bank-sync/v1");
const DEFAULT_KDF: KdfParams = { N: 2 ** 15, r: 8, p: 1 };

function deriveKey(passphrase: string, salt: Buffer, kdf: KdfParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(passphrase, salt, 32, { ...kdf, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export class Vault {
  private key: Buffer | null = null;
  private salt: Buffer | null = null;
  private kdf: KdfParams = DEFAULT_KDF;
  private data: VaultData | null = null;

  constructor(
    readonly filePath: string,
    /** Tests lower N to keep them fast. */
    private readonly kdfParams: KdfParams = DEFAULT_KDF,
  ) {}

  async exists(): Promise<boolean> {
    try {
      await access(this.filePath);
      return true;
    } catch {
      return false;
    }
  }

  get unlocked(): boolean {
    return this.key !== null && this.data !== null;
  }

  async create(passphrase: string): Promise<void> {
    if (passphrase.length < 8) throw new VaultError("short_passphrase");
    if (await this.exists()) throw new VaultError("exists");
    this.salt = randomBytes(16);
    this.kdf = this.kdfParams;
    this.key = await deriveKey(passphrase, this.salt, this.kdf);
    this.data = { providers: {} };
    await this.persist();
  }

  async unlock(passphrase: string): Promise<void> {
    let file: VaultFile;
    try {
      file = JSON.parse(await readFile(this.filePath, "utf8")) as VaultFile;
    } catch {
      throw new VaultError((await this.exists()) ? "corrupt" : "missing");
    }
    if (file.v !== 1 || file.kdf?.alg !== "scrypt") throw new VaultError("corrupt");
    const salt = Buffer.from(file.kdf.salt, "base64");
    const kdf = { N: file.kdf.N, r: file.kdf.r, p: file.kdf.p };
    const key = await deriveKey(passphrase, salt, kdf);
    let plain: string;
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(file.iv, "base64"));
      decipher.setAAD(AAD);
      decipher.setAuthTag(Buffer.from(file.tag, "base64"));
      plain = Buffer.concat([decipher.update(Buffer.from(file.ct, "base64")), decipher.final()]).toString("utf8");
    } catch {
      key.fill(0);
      throw new VaultError("wrong_passphrase");
    }
    this.key?.fill(0);
    this.key = key;
    this.salt = salt;
    this.kdf = kdf;
    const parsed = JSON.parse(plain) as VaultData;
    this.data = { ...parsed, providers: parsed.providers ?? {} };
  }

  /** Copy of the decrypted data; throws when locked. */
  get(): VaultData {
    if (!this.data) throw new VaultError("locked");
    return structuredClone(this.data);
  }

  async update(fn: (draft: VaultData) => void): Promise<void> {
    if (!this.data) throw new VaultError("locked");
    const draft = structuredClone(this.data);
    fn(draft);
    this.data = draft;
    await this.persist();
  }

  /** Zero the key and drop decrypted data from memory. */
  lock(): void {
    this.key?.fill(0);
    this.key = null;
    this.data = null;
  }

  private async persist(): Promise<void> {
    if (!this.key || !this.salt || !this.data) throw new VaultError("locked");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(AAD);
    const ct = Buffer.concat([cipher.update(JSON.stringify(this.data), "utf8"), cipher.final()]);
    const file: VaultFile = {
      v: 1,
      kdf: { alg: "scrypt", ...this.kdf, salt: this.salt.toString("base64") },
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ct: ct.toString("base64"),
    };
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await writeFile(tmp, JSON.stringify(file), { mode: 0o600 });
    await rename(tmp, this.filePath);
  }
}
