import { describe, expect, it } from "vitest";
import type { ScrapedTransaction } from "@financial-management/shared";
import { jerusalemDate, mapScrapedAccount } from "./bank-sync-mapper.js";

function txn(overrides: Partial<ScrapedTransaction> = {}): ScrapedTransaction {
  return {
    identifier: "1001",
    date: "2024-05-01T21:00:00.000Z",
    chargedAmount: "-45.90",
    description: "  סופר   שכונתי ",
    status: "completed",
    ...overrides,
  };
}

function one(t: ScrapedTransaction) {
  const result = mapScrapedAccount("discount", "1234567", [t]);
  expect(result.rows).toHaveLength(1);
  return result.rows[0]!;
}

describe("jerusalemDate", () => {
  it("converts a UTC evening time to the next Israeli calendar day", () => {
    expect(jerusalemDate("2024-05-01T21:00:00.000Z")).toBe("2024-05-02");
  });

  it("handles summer DST (UTC+3)", () => {
    expect(jerusalemDate("2024-07-15T20:59:00.000Z")).toBe("2024-07-15");
    expect(jerusalemDate("2024-07-15T21:00:00.000Z")).toBe("2024-07-16");
  });

  it("handles winter time (UTC+2)", () => {
    expect(jerusalemDate("2024-01-10T21:59:00.000Z")).toBe("2024-01-10");
    expect(jerusalemDate("2024-01-10T22:00:00.000Z")).toBe("2024-01-11");
  });
});

describe("mapScrapedAccount", () => {
  it("maps a negative amount to a positive expense", () => {
    const row = one(txn());
    expect(row.type).toBe("expense");
    expect(row.amount).toBe("45.90");
    expect(row.description).toBe("סופר   שכונתי");
    expect(row.transactionDate).toBe("2024-05-02");
    expect(row.postedDate).toBeNull();
    expect(row.notes).toBeNull();
    expect(row.externalRef).toMatch(/^bs1:[0-9a-f]{64}$/);
  });

  it("maps a positive amount to income", () => {
    const row = one(txn({ chargedAmount: "120.00" }));
    expect(row.type).toBe("income");
    expect(row.amount).toBe("120.00");
  });

  it("skips and counts pending, zero and foreign-currency rows", () => {
    const result = mapScrapedAccount("max", "9876", [
      txn({ status: "pending" }),
      txn({ chargedAmount: "0.00" }),
      txn({ chargedAmount: "-10.00", chargedCurrency: "USD" }),
      txn({ chargedAmount: "-10.00", chargedCurrency: "ILS" }),
      txn({ chargedAmount: "-11.00", chargedCurrency: "₪" }),
    ]);
    expect(result.skippedPending).toBe(1);
    expect(result.skippedInvalid).toBe(1);
    expect(result.skippedForeign).toBe(1);
    expect(result.skipped).toEqual([
      { index: 0, reason: "pending" },
      { index: 1, reason: "invalid" },
      { index: 2, reason: "foreign" },
    ]);
    expect(result.rows).toHaveLength(2);
  });

  it("maps processedDate to postedDate in Jerusalem time", () => {
    const row = one(txn({ processedDate: "2024-06-09T21:30:00.000Z" }));
    expect(row.postedDate).toBe("2024-06-10");
  });

  it("builds notes from memo, installments and foreign original amount", () => {
    const row = one(
      txn({
        memo: "הערה",
        installments: { number: 2, total: 6 },
        originalAmount: "-12.50",
        originalCurrency: "USD",
      }),
    );
    expect(row.notes).toBe("הערה · תשלום 2 מתוך 6 · סכום מקור: 12.50 USD");
  });

  it("falls back to a Hebrew description when empty", () => {
    expect(one(txn({ description: "   " })).description).toBe("ללא תיאור");
  });

  it("produces a stable externalRef that changes with the amount", () => {
    const a = one(txn()).externalRef;
    const b = one(txn()).externalRef;
    const c = one(txn({ chargedAmount: "-45.91" })).externalRef;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("ignores description whitespace/case differences in the key", () => {
    expect(one(txn({ description: "Shop  A" })).externalRef).toBe(
      one(txn({ description: "shop a" })).externalRef,
    );
  });

  it("suffixes identical rows with an occurrence counter", () => {
    const result = mapScrapedAccount("discount", "1234567", [
      txn({ identifier: undefined }),
      txn({ identifier: undefined }),
      txn({ identifier: undefined }),
    ]);
    const refs = result.rows.map((r) => r.externalRef);
    expect(refs[1]).toBe(`${refs[0]}#2`);
    expect(refs[2]).toBe(`${refs[0]}#3`);
  });

  it("is deterministic without an identifier and distinguishes numeric-string identifiers", () => {
    const noId = one(txn({ identifier: undefined })).externalRef;
    expect(one(txn({ identifier: undefined })).externalRef).toBe(noId);
    const id1 = one(txn({ identifier: "555" })).externalRef;
    const id2 = one(txn({ identifier: "556" })).externalRef;
    expect(id1).not.toBe(id2);
    expect(id1).not.toBe(noId);
  });

  it("keys on provider and account number", () => {
    const a = mapScrapedAccount("discount", "1", [txn()]).rows[0]!.externalRef;
    const b = mapScrapedAccount("discount", "2", [txn()]).rows[0]!.externalRef;
    const c = mapScrapedAccount("max", "1", [txn()]).rows[0]!.externalRef;
    expect(new Set([a, b, c]).size).toBe(3);
  });
});
