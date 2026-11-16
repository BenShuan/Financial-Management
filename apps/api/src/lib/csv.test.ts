import { describe, expect, it } from "vitest";
import type { ImportColumnMap } from "@financial-management/shared";
import { dedupeFingerprint, normalizeRows, parseCsv } from "./csv.js";

describe("parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles CRLF and a trailing newline", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps commas, escaped quotes and newlines inside quoted fields", () => {
    expect(parseCsv('desc,amount\n"Shop, Ltd","-12.50"\n"say ""hi""","1"\n"two\nlines","2"')).toEqual([
      ["desc", "amount"],
      ["Shop, Ltd", "-12.50"],
      ['say "hi"', "1"],
      ["two\nlines", "2"],
    ]);
  });

  it("skips fully blank lines but keeps empty cells", () => {
    expect(parseCsv("a,b\n\n,\n1,\n")).toEqual([
      ["a", "b"],
      ["1", ""],
    ]);
  });

  it("returns no rows for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("preserves Hebrew text", () => {
    expect(parseCsv("תיאור,סכום\nסופר,-45.90")).toEqual([
      ["תיאור", "סכום"],
      ["סופר", "-45.90"],
    ]);
  });
});

const map = (overrides: Partial<ImportColumnMap> = {}): ImportColumnMap => ({
  date: "Date",
  description: "Description",
  amount: "Amount",
  dateFormat: "dd/MM/yyyy",
  negativeIsExpense: true,
  ...overrides,
});

describe("normalizeRows", () => {
  it("maps columns, dates and signed amounts (bank convention)", () => {
    const { headers, rows } = normalizeRows(
      parseCsv("Date,Description,Amount\n05/03/2025,Supermarket,-45.9\n06/03/2025,Salary,8000"),
      map(),
    );
    expect(headers).toEqual(["Date", "Description", "Amount"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      rowIndex: 0,
      transactionDate: "2025-03-05",
      description: "Supermarket",
      amount: "45.90",
      flow: "expense",
    });
    expect(rows[1]).toMatchObject({
      transactionDate: "2025-03-06",
      amount: "8000.00",
      flow: "income",
    });
    expect(rows.every((r) => r.parseError === undefined)).toBe(true);
  });

  it("flips the sign convention when negativeIsExpense is false", () => {
    const { rows } = normalizeRows(
      parseCsv("Date,Description,Amount\n05/03/2025,Card charge,100\n06/03/2025,Refund,-20"),
      map({ negativeIsExpense: false }),
    );
    expect(rows[0]).toMatchObject({ flow: "expense", amount: "100.00" });
    expect(rows[1]).toMatchObject({ flow: "income", amount: "20.00" });
  });

  it("strips currency symbols and thousands separators, and reads (x) as negative", () => {
    const { rows } = normalizeRows(
      parseCsv('Date,Description,Amount\n01/01/2025,Rent,"(3,200.50)"\n02/01/2025,Bonus,"₪ 1,000"'),
      map(),
    );
    expect(rows[0]).toMatchObject({ amount: "3200.50", flow: "expense" });
    expect(rows[1]).toMatchObject({ amount: "1000.00", flow: "income" });
  });

  it.each([
    ["yyyy-MM-dd", "2025-03-05", "2025-03-05"],
    ["dd/MM/yyyy", "05/03/2025", "2025-03-05"],
    ["MM/dd/yyyy", "03/05/2025", "2025-03-05"],
    ["dd/MM/yyyy", "5.3.25", "2025-03-05"],
  ] as const)("parses %s dates (%s)", (dateFormat, input, expected) => {
    const { rows } = normalizeRows(
      parseCsv(`Date,Description,Amount\n${input},X,-1`),
      map({ dateFormat }),
    );
    expect(rows[0]?.transactionDate).toBe(expected);
  });

  it("maps the optional merchant column", () => {
    const { rows } = normalizeRows(
      parseCsv("Date,Description,Amount,Shop\n05/03/2025,Card,-1,Rami Levy\n06/03/2025,Card,-1,"),
      map({ merchant: "Shop" }),
    );
    expect(rows[0]?.merchantName).toBe("Rami Levy");
    expect(rows[1]?.merchantName).toBeNull();
  });

  it("keeps the raw row keyed by header", () => {
    const { rows } = normalizeRows(parseCsv("Date,Description,Amount\n05/03/2025,X,-1"), map());
    expect(rows[0]?.raw).toEqual({ Date: "05/03/2025", Description: "X", Amount: "-1" });
  });

  it("flags bad rows instead of throwing", () => {
    const { rows } = normalizeRows(
      parseCsv(
        [
          "Date,Description,Amount",
          "not-a-date,A,-1",
          "2025-13-01,B,-1",
          "05/03/2025,C,abc",
          "05/03/2025,D,0",
          "05/03/2025,E,-1",
        ].join("\n"),
      ),
      map(),
    );
    expect(rows.map((r) => r.parseError)).toEqual([
      "תאריך לא תקין",
      "תאריך לא תקין",
      "סכום לא תקין",
      "סכום לא תקין",
      undefined,
    ]);
  });

  it("flags every row when a mapped column is missing from the file", () => {
    const { rows } = normalizeRows(
      parseCsv("Date,Description,Amount\n05/03/2025,X,-1"),
      map({ amount: "Total" }),
    );
    expect(rows[0]?.parseError).toBe("עמודה ממופה חסרה בקובץ");
  });

  it("returns no rows for header-only input", () => {
    expect(normalizeRows(parseCsv("Date,Description,Amount"), map()).rows).toEqual([]);
  });
});

describe("dedupeFingerprint", () => {
  const base = ["acc-1", "2025-03-05", "45.90", "expense", "Supermarket"] as const;

  it("is a deterministic sha256 hex digest", () => {
    const a = dedupeFingerprint(...base);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(dedupeFingerprint(...base)).toBe(a);
  });

  it("ignores case and whitespace differences in the description", () => {
    expect(dedupeFingerprint("acc-1", "2025-03-05", "45.90", "expense", "  SUPERMARKET  ")).toBe(
      dedupeFingerprint(...base),
    );
    expect(dedupeFingerprint("acc-1", "2025-03-05", "45.90", "expense", "Rami   Levy")).toBe(
      dedupeFingerprint("acc-1", "2025-03-05", "45.90", "expense", "rami levy"),
    );
  });

  it.each([
    ["account", ["acc-2", "2025-03-05", "45.90", "expense", "Supermarket"]],
    ["date", ["acc-1", "2025-03-06", "45.90", "expense", "Supermarket"]],
    ["amount", ["acc-1", "2025-03-05", "45.91", "expense", "Supermarket"]],
    ["flow", ["acc-1", "2025-03-05", "45.90", "income", "Supermarket"]],
    ["description", ["acc-1", "2025-03-05", "45.90", "expense", "Pharmacy"]],
  ] as const)("changes when the %s changes", (_field, args) => {
    expect(dedupeFingerprint(...args)).not.toBe(dedupeFingerprint(...base));
  });
});
