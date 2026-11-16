import { describe, expect, it } from "vitest";
import {
  fromMinorUnits,
  moneyEquals,
  moneySchema,
  positiveMoneySchema,
  signedMoneySchema,
  sumMoney,
  toMinorUnits,
} from "./money.js";

describe("toMinorUnits", () => {
  it.each([
    ["0", 0n],
    ["0.00", 0n],
    ["1850", 185000n],
    ["1850.00", 185000n],
    ["1850.5", 185050n],
    ["0.07", 7n],
    ["0.1", 10n],
    ["-12.30", -1230n],
    ["-0.05", -5n],
  ])("converts %s to %s agorot", (amount, expected) => {
    expect(toMinorUnits(amount)).toBe(expected);
  });

  it("is exact for amounts that floats cannot represent", () => {
    expect(toMinorUnits("0.10") + toMinorUnits("0.20")).toBe(toMinorUnits("0.30"));
    expect(toMinorUnits("9007199254740993.99")).toBe(900719925474099399n);
  });
});

describe("fromMinorUnits", () => {
  it.each([
    [0n, "0.00"],
    [5n, "0.05"],
    [185050n, "1850.50"],
    [-5n, "-0.05"],
    [-1230n, "-12.30"],
    [900719925474099399n, "9007199254740993.99"],
  ])("formats %s agorot as %s", (minor, expected) => {
    expect(fromMinorUnits(minor)).toBe(expected);
  });

  it("round-trips with toMinorUnits", () => {
    for (const amount of ["0.00", "0.01", "99.99", "-45.10", "1234567.89"]) {
      expect(fromMinorUnits(toMinorUnits(amount))).toBe(amount);
    }
  });
});

describe("sumMoney", () => {
  it("returns 0.00 for no amounts", () => {
    expect(sumMoney([])).toBe("0.00");
  });

  it("sums without float drift", () => {
    expect(sumMoney(["0.10", "0.20"])).toBe("0.30");
    expect(sumMoney(Array.from({ length: 10 }, () => "0.10"))).toBe("1.00");
  });

  it("handles mixed precision and signed values", () => {
    expect(sumMoney(["100", "50.5", "-20.25"])).toBe("130.25");
    expect(sumMoney(["10.00", "-10.00"])).toBe("0.00");
  });
});

describe("moneyEquals", () => {
  it("compares by value, not by spelling", () => {
    expect(moneyEquals("1.5", "1.50")).toBe(true);
    expect(moneyEquals("100", "100.00")).toBe(true);
    expect(moneyEquals("0.10", "0.11")).toBe(false);
  });
});

describe("moneySchema", () => {
  it.each(["0", "12", "12.5", "1850.00", "9999999999999999.99"])("accepts %s", (value) => {
    expect(moneySchema.safeParse(value).success).toBe(true);
  });

  it.each(["", "-1", "1.234", "abc", ".5", "1,000", " 1", "1e3", "99999999999999999"])(
    "rejects %j",
    (value) => {
      expect(moneySchema.safeParse(value).success).toBe(false);
    },
  );

  it("rejects non-strings (money is never a number)", () => {
    expect(moneySchema.safeParse(12.5).success).toBe(false);
  });
});

describe("positiveMoneySchema", () => {
  it("accepts strictly positive amounts", () => {
    expect(positiveMoneySchema.safeParse("0.01").success).toBe(true);
  });

  it.each(["0", "0.00"])("rejects zero (%s)", (value) => {
    expect(positiveMoneySchema.safeParse(value).success).toBe(false);
  });
});

describe("signedMoneySchema", () => {
  it.each(["0.00", "-12.30", "45", "-1"])("accepts %s", (value) => {
    expect(signedMoneySchema.safeParse(value).success).toBe(true);
  });

  it.each(["+1", "--1", "1.234", "-"])("rejects %s", (value) => {
    expect(signedMoneySchema.safeParse(value).success).toBe(false);
  });
});
