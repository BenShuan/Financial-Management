import { createHash } from "node:crypto";
import type { ImportColumnMap } from "@financial-management/shared";

/** Minimal CSV parser: quoted fields, escaped quotes, CRLF. Returns rows of cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export interface NormalizedCsvRow {
  rowIndex: number;
  raw: Record<string, string>;
  transactionDate: string; // ISO yyyy-MM-dd
  description: string;
  merchantName: string | null;
  amount: string; // positive decimal string
  flow: "income" | "expense";
  parseError?: string;
}

function parseDate(value: string, format: ImportColumnMap["dateFormat"]): string | null {
  const v = value.trim();
  let year: string, month: string, day: string;
  const parts = v.split(/[/\-.]/);
  if (format === "yyyy-MM-dd") {
    if (parts.length !== 3) return null;
    [year = "", month = "", day = ""] = parts;
  } else if (format === "dd/MM/yyyy") {
    if (parts.length !== 3) return null;
    [day = "", month = "", year = ""] = parts;
  } else {
    if (parts.length !== 3) return null;
    [month = "", day = "", year = ""] = parts;
  }
  if (year.length === 2) year = `20${year}`;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(Date.parse(iso)) ? iso : null;
}

function parseAmount(value: string): number | null {
  const cleaned = value.replace(/[₪$€,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (cleaned === "" || Number.isNaN(Number(cleaned))) return null;
  return Number(cleaned);
}

/** Applies a column map to parsed CSV rows (first row = headers). */
export function normalizeRows(
  cells: string[][],
  map: ImportColumnMap,
): { headers: string[]; rows: NormalizedCsvRow[] } {
  const [headerRow, ...dataRows] = cells;
  const headers = (headerRow ?? []).map((h) => h.trim());
  const col = (name: string | undefined) =>
    name ? headers.findIndex((h) => h === name.trim()) : -1;
  const dateIdx = col(map.date);
  const descIdx = col(map.description);
  const amountIdx = col(map.amount);
  const merchantIdx = col(map.merchant);

  const rows: NormalizedCsvRow[] = dataRows.map((cellsRow, i) => {
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      raw[h] = cellsRow[idx] ?? "";
    });
    const base: NormalizedCsvRow = {
      rowIndex: i,
      raw,
      transactionDate: "",
      description: (cellsRow[descIdx] ?? "").trim(),
      merchantName: merchantIdx >= 0 ? (cellsRow[merchantIdx] ?? "").trim() || null : null,
      amount: "0.00",
      flow: "expense",
    };
    if (dateIdx < 0 || descIdx < 0 || amountIdx < 0) {
      return { ...base, parseError: "עמודה ממופה חסרה בקובץ" };
    }
    const date = parseDate(cellsRow[dateIdx] ?? "", map.dateFormat);
    if (!date) return { ...base, parseError: "תאריך לא תקין" };
    const amount = parseAmount(cellsRow[amountIdx] ?? "");
    if (amount === null || amount === 0) return { ...base, parseError: "סכום לא תקין" };
    const isExpense = map.negativeIsExpense ? amount < 0 : amount > 0;
    return {
      ...base,
      transactionDate: date,
      amount: Math.abs(amount).toFixed(2),
      flow: isExpense ? "expense" : "income",
    };
  });
  return { headers, rows };
}

/** Stable fingerprint for dedupe: account + date + signed amount + normalized description. */
export function dedupeFingerprint(
  accountId: string,
  transactionDate: string,
  amount: string,
  flow: string,
  description: string,
): string {
  const normalized = description.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256")
    .update(`${accountId}|${transactionDate}|${flow}|${amount}|${normalized}`)
    .digest("hex");
}
