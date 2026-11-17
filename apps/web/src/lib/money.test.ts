import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dateGroupLabel,
  formatCurrency,
  formatCurrencyWhole,
  formatDate,
  formatDateFull,
} from "./money";

// he-IL output embeds bidi marks and NBSPs; compare on the visible characters only.
const visible = (s: string) => s.replace(/[\u200e\u200f\u061c\u00a0\u202f]/g, " ").trim();

describe("formatCurrency", () => {
  it("formats decimal strings as ILS with two fraction digits", () => {
    const out = visible(formatCurrency("1850"));
    expect(out).toContain("1,850.00");
    expect(out).toContain("₪");
  });

  it("keeps agorot exact for string input", () => {
    expect(visible(formatCurrency("0.07"))).toContain("0.07");
  });

  it("accepts a different currency", () => {
    expect(visible(formatCurrency("10", { currency: "USD" }))).toContain("$");
  });

  it("honours signDisplay", () => {
    expect(visible(formatCurrency("-5", { signDisplay: "never" }))).not.toContain("-");
    expect(visible(formatCurrency("5", { signDisplay: "always" }))).toContain("+");
  });

  it.each(["abc", "Infinity", "NaN"])("returns a dash for non-finite input %j", (value) => {
    expect(formatCurrency(value)).toBe("—");
  });
});

describe("formatCurrencyWhole", () => {
  it("drops agorot", () => {
    const out = visible(formatCurrencyWhole("8240"));
    expect(out).toContain("8,240");
    expect(out).not.toContain(".");
  });

  it("returns a dash for non-finite input", () => {
    expect(formatCurrencyWhole("abc")).toBe("—");
  });
});

describe("date formatting", () => {
  it("formatDate renders day and short month", () => {
    expect(formatDate("2025-03-09T12:00:00Z", "UTC")).toMatch(/9/);
  });

  it("formatDateFull includes the year", () => {
    expect(formatDateFull("2025-03-09T12:00:00Z", "UTC")).toContain("2025");
  });

  it("respects the time zone", () => {
    // 23:30 UTC is already the next day in Jerusalem.
    expect(formatDate("2025-03-09T23:30:00Z", "UTC")).not.toBe(
      formatDate("2025-03-09T23:30:00Z", "Asia/Jerusalem"),
    );
  });
});

describe("dateGroupLabel", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("labels today and yesterday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
    expect(dateGroupLabel("2026-03-15")).toBe("היום");
    expect(dateGroupLabel("2026-03-14")).toBe("אתמול");
  });

  it("falls back to a full date for older days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));
    expect(dateGroupLabel("2025-12-31")).toContain("2025");
  });
});
