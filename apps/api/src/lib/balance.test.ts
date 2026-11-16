import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  const execute = vi.fn();
  return { where, set, update, execute };
});

vi.mock("../db/index.js", () => ({
  db: { execute: mocks.execute, update: mocks.update },
}));

import { recalcAccountBalance } from "./balance.js";

// The ledger arithmetic itself (opening + income - expense +/- transfers) is a single SQL
// statement, so it needs a real Postgres to verify. These tests cover the TypeScript around it:
// what is returned, what is persisted, and the empty-result fallback.
describe("recalcAccountBalance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the balance computed by the database", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ balance: "1234.56" }] });
    await expect(recalcAccountBalance("acc-1")).resolves.toBe("1234.56");
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("keeps negative balances as decimal strings", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ balance: "-80.05" }] });
    await expect(recalcAccountBalance("acc-1")).resolves.toBe("-80.05");
  });

  it("persists the computed balance on the account", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ balance: "99.90" }] });
    await recalcAccountBalance("acc-1");
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.set).toHaveBeenCalledWith({ currentBalance: "99.90" });
    expect(mocks.where).toHaveBeenCalledTimes(1);
  });

  it("falls back to 0.00 when the account has no row", async () => {
    mocks.execute.mockResolvedValue({ rows: [] });
    await expect(recalcAccountBalance("missing")).resolves.toBe("0.00");
    expect(mocks.set).toHaveBeenCalledWith({ currentBalance: "0.00" });
  });
});
