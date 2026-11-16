import { describe, expect, it } from "vitest";
import { clearFailures, isThrottled, recordFailure } from "./login-throttle.js";
import { hashPassword, verifyPassword } from "./password.js";

describe("password hashing", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong horse battery", hash)).toBe(false);
  });

  it("salts each hash", async () => {
    expect(await hashPassword("same-password-1")).not.toBe(await hashPassword("same-password-1"));
  });

  it("rejects malformed stored hashes", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });
});

describe("login throttle", () => {
  it("blocks after repeated failures and expires with the window", () => {
    const key = "throttle@example.com";
    const t0 = 1_000_000;
    for (let i = 0; i < 8; i++) recordFailure(key, t0);
    expect(isThrottled(key, t0 + 1000)).toBe(true);
    expect(isThrottled(key, t0 + 16 * 60 * 1000)).toBe(false);
    clearFailures(key);
  });
});
