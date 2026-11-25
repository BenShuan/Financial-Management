import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Vault, VaultError } from "./vault.js";

const FAST = { N: 2 ** 10, r: 8, p: 1 };
let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "fm-vault-"));
  file = join(dir, "vault.enc.json");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("Vault", () => {
  it("round-trips data and never writes plaintext", async () => {
    const v = new Vault(file, FAST);
    await v.create("correct horse");
    await v.update((d) => {
      d.providers.discount = { id: "012345678", password: "SuperSecret!1", num: "AB12" };
      d.session = { apiOrigin: "https://api.example", token: "tok-abc-123", expiresAt: "2030-01-01T00:00:00.000Z", email: "a@b.co" };
    });
    v.lock();
    expect(v.unlocked).toBe(false);
    expect(() => v.get()).toThrow(VaultError);

    const raw = await readFile(file, "utf8");
    for (const secret of ["SuperSecret!1", "012345678", "tok-abc-123", "AB12"]) expect(raw).not.toContain(secret);

    const v2 = new Vault(file, FAST);
    await v2.unlock("correct horse");
    expect(v2.get().providers.discount?.password).toBe("SuperSecret!1");
    expect(v2.get().session?.token).toBe("tok-abc-123");
  });

  it("rejects a wrong passphrase", async () => {
    const v = new Vault(file, FAST);
    await v.create("correct horse");
    v.lock();
    await expect(new Vault(file, FAST).unlock("wrong horse")).rejects.toMatchObject({ code: "wrong_passphrase" });
  });

  it("detects tampered ciphertext or tag", async () => {
    const v = new Vault(file, FAST);
    await v.create("correct horse");
    const parsed = JSON.parse(await readFile(file, "utf8")) as { ct: string; tag: string };
    const ct = Buffer.from(parsed.ct, "base64");
    ct[0] = (ct[0] ?? 0) ^ 0xff;
    await writeFile(file, JSON.stringify({ ...parsed, ct: ct.toString("base64") }));
    await expect(new Vault(file, FAST).unlock("correct horse")).rejects.toMatchObject({ code: "wrong_passphrase" });
  });

  it("uses a fresh IV on every save", async () => {
    const v = new Vault(file, FAST);
    await v.create("correct horse");
    const iv1 = (JSON.parse(await readFile(file, "utf8")) as { iv: string }).iv;
    await v.update((d) => {
      d.providers.max = { username: "u", password: "p" };
    });
    const iv2 = (JSON.parse(await readFile(file, "utf8")) as { iv: string }).iv;
    expect(iv1).not.toBe(iv2);
  });

  it("enforces a minimum passphrase and refuses to overwrite", async () => {
    await expect(new Vault(file, FAST).create("short")).rejects.toMatchObject({ code: "short_passphrase" });
    await new Vault(file, FAST).create("correct horse");
    await expect(new Vault(file, FAST).create("correct horse")).rejects.toMatchObject({ code: "exists" });
  });

  it("reports a missing vault", async () => {
    await expect(new Vault(join(dir, "nope.json"), FAST).unlock("whatever1")).rejects.toMatchObject({ code: "missing" });
  });
});
