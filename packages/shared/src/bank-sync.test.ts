import { describe, expect, it } from "vitest";
import {
  bankSyncUploadSchema,
  scrapedTransactionSchema,
  updateSyncAccountLinkSchema,
} from "./bank-sync.js";

const txn = {
  identifier: "123",
  date: "2024-05-01T21:00:00.000Z",
  chargedAmount: "-45.90",
  description: "סופר",
  status: "completed" as const,
};

function upload(overrides: Record<string, unknown> = {}) {
  return {
    provider: "discount",
    scrapedAt: "2024-05-03T10:00:00.000Z",
    startDate: "2024-02-01",
    accounts: [{ accountNumber: "1234567", txns: [txn] }],
    ...overrides,
  };
}

describe("scrapedTransactionSchema", () => {
  it("accepts signed decimal strings", () => {
    expect(scrapedTransactionSchema.safeParse(txn).success).toBe(true);
    expect(scrapedTransactionSchema.safeParse({ ...txn, chargedAmount: "-12.30" }).success).toBe(
      true,
    );
    expect(scrapedTransactionSchema.safeParse({ ...txn, chargedAmount: "200.00" }).success).toBe(
      true,
    );
  });

  it("rejects number amounts", () => {
    expect(scrapedTransactionSchema.safeParse({ ...txn, chargedAmount: -45.9 }).success).toBe(
      false,
    );
  });

  it("rejects unknown keys (no credentials or raw payloads)", () => {
    expect(scrapedTransactionSchema.safeParse({ ...txn, password: "x" }).success).toBe(false);
    expect(scrapedTransactionSchema.safeParse({ ...txn, rawTransaction: {} }).success).toBe(false);
  });

  it("accepts installments and offset datetimes", () => {
    expect(
      scrapedTransactionSchema.safeParse({
        ...txn,
        date: "2024-05-01T00:00:00+03:00",
        installments: { number: 2, total: 6 },
      }).success,
    ).toBe(true);
  });
});

describe("bankSyncUploadSchema", () => {
  it("accepts a valid upload", () => {
    expect(bankSyncUploadSchema.safeParse(upload()).success).toBe(true);
  });

  it("rejects an unknown provider", () => {
    expect(bankSyncUploadSchema.safeParse(upload({ provider: "hapoalim" })).success).toBe(false);
  });

  it("rejects credential keys at every level", () => {
    expect(bankSyncUploadSchema.safeParse(upload({ password: "x" })).success).toBe(false);
    expect(
      bankSyncUploadSchema.safeParse(
        upload({ accounts: [{ accountNumber: "1", txns: [], password: "x" }] }),
      ).success,
    ).toBe(false);
    expect(
      bankSyncUploadSchema.safeParse(
        upload({ accounts: [{ accountNumber: "1", txns: [{ ...txn, password: "x" }] }] }),
      ).success,
    ).toBe(false);
  });

  it("enforces account and transaction caps", () => {
    expect(bankSyncUploadSchema.safeParse(upload({ accounts: [] })).success).toBe(false);
    const many = Array.from({ length: 51 }, (_, i) => ({ accountNumber: String(i), txns: [] }));
    expect(bankSyncUploadSchema.safeParse(upload({ accounts: many })).success).toBe(false);
    const txns = Array.from({ length: 5001 }, () => txn);
    expect(
      bankSyncUploadSchema.safeParse(upload({ accounts: [{ accountNumber: "1", txns }] })).success,
    ).toBe(false);
  });
});

describe("updateSyncAccountLinkSchema", () => {
  it("requires accountId when linking", () => {
    expect(updateSyncAccountLinkSchema.safeParse({ status: "linked" }).success).toBe(false);
    expect(
      updateSyncAccountLinkSchema.safeParse({
        status: "linked",
        accountId: "6f1c2b0e-8a4d-4e3b-9c1a-2b3c4d5e6f70",
      }).success,
    ).toBe(true);
    expect(updateSyncAccountLinkSchema.safeParse({ status: "ignored" }).success).toBe(true);
    expect(updateSyncAccountLinkSchema.safeParse({ status: "unmapped" }).success).toBe(true);
  });
});
