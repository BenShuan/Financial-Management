import { describe, expect, it } from "vitest";
import { createAccountSchema, updateAccountSchema } from "./account.js";

describe("updateAccountSchema", () => {
  it("does not inject openingBalance on a partial update", () => {
    const result = updateAccountSchema.parse({ name: "x" });
    expect("openingBalance" in result).toBe(false);
  });

  it("accepts null to clear optional fields", () => {
    const result = updateAccountSchema.parse({
      institutionName: null,
      accountMask: null,
      creditLimit: null,
      notes: null,
    });
    expect(result).toEqual({ institutionName: null, accountMask: null, creditLimit: null, notes: null });
  });

  it("rejects null for required fields and accepts a negative opening balance", () => {
    expect(updateAccountSchema.safeParse({ name: null }).success).toBe(false);
    expect(updateAccountSchema.safeParse({ type: null }).success).toBe(false);
    expect(updateAccountSchema.safeParse({ openingBalance: null }).success).toBe(false);
    expect(updateAccountSchema.safeParse({ openingBalance: "-50.5" }).success).toBe(true);
  });
});

describe("createAccountSchema", () => {
  it("defaults openingBalance to 0.00", () => {
    expect(createAccountSchema.parse({ name: "a", type: "cash" }).openingBalance).toBe("0.00");
  });

  it("does not accept null for optional fields", () => {
    expect(createAccountSchema.safeParse({ name: "a", type: "cash", creditLimit: null }).success).toBe(false);
  });
});
