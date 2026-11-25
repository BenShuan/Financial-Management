import { describe, expect, it } from "vitest";
import { bankSyncUploadSchema } from "@financial-management/shared";
import { toScrapedTransaction, toSignedMoney, toUpload, type ScraperTxn } from "./serialize.js";

const base: ScraperTxn = {
  type: "normal",
  identifier: 12345,
  date: "2024-05-01T21:00:00.000Z",
  processedDate: "2024-05-10T21:00:00.000Z",
  originalAmount: -45.9,
  originalCurrency: "ILS",
  chargedAmount: -45.9,
  chargedCurrency: "ILS",
  description: "  סופר  ",
  memo: "",
  status: "completed",
  category: "מזון",
  rawTransaction: { secret: "x" },
};

describe("toSignedMoney", () => {
  it("formats via integer agorot", () => {
    expect(toSignedMoney(-12.3)).toBe("-12.30");
    expect(toSignedMoney(0.1 + 0.2)).toBe("0.30");
    expect(toSignedMoney(120)).toBe("120.00");
    expect(toSignedMoney(-0)).toBe("0.00");
    expect(toSignedMoney(-0.004)).toBe("0.00");
    expect(toSignedMoney(1234567.891)).toBe("1234567.89");
  });
  it("rejects non-finite numbers", () => {
    expect(() => toSignedMoney(Number.NaN)).toThrow();
    expect(() => toSignedMoney(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("toScrapedTransaction", () => {
  it("keeps only contract fields and stringifies the identifier", () => {
    const row = toScrapedTransaction(base);
    expect(row).toEqual({
      identifier: "12345",
      date: "2024-05-01T21:00:00.000Z",
      processedDate: "2024-05-10T21:00:00.000Z",
      chargedAmount: "-45.90",
      originalAmount: "-45.90",
      originalCurrency: "ILS",
      chargedCurrency: "ILS",
      description: "  סופר  ",
      status: "completed",
    });
    expect(row).not.toHaveProperty("rawTransaction");
    expect(row).not.toHaveProperty("category");
    expect(row).not.toHaveProperty("type");
  });
  it("passes pending and installments through (server decides)", () => {
    const row = toScrapedTransaction({ ...base, status: "pending", installments: { number: 2, total: 6 }, memo: "הערה" });
    expect(row?.status).toBe("pending");
    expect(row?.installments).toEqual({ number: 2, total: 6 });
    expect(row?.memo).toBe("הערה");
  });
  it("drops rows with no usable date or amount", () => {
    expect(toScrapedTransaction({ ...base, date: "not a date" })).toBeNull();
    expect(toScrapedTransaction({ ...base, chargedAmount: Number.NaN })).toBeNull();
  });
});

describe("toUpload", () => {
  it("builds a payload that passes the shared strict schema", () => {
    const { body, droppedInvalid } = toUpload(
      "discount",
      new Date("2024-05-20T08:00:00.000Z"),
      new Date("2024-02-20T08:00:00.000Z"),
      [
        { accountNumber: " 123-456789 ", balance: 1000, txns: [base, { ...base, chargedAmount: 200, identifier: undefined }, { ...base, date: "" }] },
      ],
      "bank-sync/test",
    );
    expect(droppedInvalid).toBe(1);
    expect(body.startDate).toBe("2024-02-20");
    expect(body.accounts[0]?.accountNumber).toBe("123-456789");
    expect(body.accounts[0]?.txns).toHaveLength(2);
    expect(() => bankSyncUploadSchema.parse(body)).not.toThrow();
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});
