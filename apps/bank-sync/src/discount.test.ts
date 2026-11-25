import { describe, expect, it } from "vitest";
import { discountFromDate, fetchDiscountAccounts, type FetchJson } from "./discount.js";

const NOW = new Date(2024, 5, 1, 12);
const START = new Date(2024, 4, 1);

const okTxns = (amount: number) => ({
  Error: null,
  CurrentAccountLastTransactions: {
    OperationEntry: [
      {
        OperationNumber: 7,
        OperationDate: "20240510",
        ValueDate: "20240511",
        OperationAmount: amount,
        OperationDescriptionToDisplay: "שכר",
      },
    ],
    FutureTransactionsBlock: { FutureTransactionEntry: [{ OperationDate: "20240602", OperationAmount: -5 }] },
  },
});

function fake(routes: (url: string) => unknown): { fetchJson: FetchJson; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    fetchJson: async (url) => {
      calls.push(url);
      return routes(url);
    },
  };
}

const accountsList = (...ids: string[]) => ({
  UserAccountsData: { UserAccounts: ids.map((AccountID) => ({ NewAccountInfo: { AccountID } })) },
});

describe("fetchDiscountAccounts", () => {
  it("skips a refused account and returns the others", async () => {
    const { fetchJson, calls } = fake((url) => {
      if (url.endsWith("/userAccountsData")) return accountsList("0111111111", "0222224321");
      if (url.includes("/0222224321/")) return { Error: { MsgText: "אין אפשרות לבצע את הפעולה" } };
      return okTxns(1000);
    });
    const r = await fetchDiscountAccounts(fetchJson, START, NOW);
    expect(r.success).toBe(true);
    expect(r.accounts.map((a) => a.accountNumber)).toEqual(["0111111111"]);
    expect(r.failedAccounts).toEqual(["4321"]);
    // refused account: full query, then one minimal retry
    expect(calls.filter((u) => u.includes("/0222224321/"))).toHaveLength(2);
    expect(r.messages.join(" ")).not.toContain("0222224321");
  });

  it("converts rows like the library (completed + pending, local dates)", async () => {
    const { fetchJson } = fake((url) => (url.endsWith("/userAccountsData") ? accountsList("0111111111") : okTxns(-42.5)));
    const r = await fetchDiscountAccounts(fetchJson, START, NOW);
    const txns = r.accounts[0]?.txns ?? [];
    expect(txns).toHaveLength(2);
    expect(txns[0]).toMatchObject({
      identifier: 7,
      date: new Date(2024, 4, 10).toISOString(),
      processedDate: new Date(2024, 4, 11).toISOString(),
      chargedAmount: -42.5,
      description: "שכר",
      status: "completed",
    });
    expect(txns[1]?.status).toBe("pending");
  });

  it("calls the current ByDate endpoint first, with FromDate and ToDate", async () => {
    const { fetchJson, calls } = fake((url) => (url.endsWith("/userAccountsData") ? accountsList("0111111111") : okTxns(10)));
    const r = await fetchDiscountAccounts(fetchJson, START, NOW);
    expect(r.success).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("/lastTransactions/transactions/0111111111/ByDate?FromDate=20240501&ToDate=20240601&");
  });

  it("falls back to the old Date endpoint when ByDate is refused", async () => {
    const { fetchJson, calls } = fake((url) => {
      if (url.endsWith("/userAccountsData")) return accountsList("0111111111");
      return url.includes("/ByDate") ? { Error: { MsgText: "x", ReturnedCode: "T101010" } } : okTxns(10);
    });
    const r = await fetchDiscountAccounts(fetchJson, START, NOW);
    expect(r.success).toBe(true);
    expect(r.failedAccounts).toEqual([]);
    expect(calls[2]).toContain("/lastTransactions/0111111111/Date?");
    expect(r.messages[0]).toContain("[T101010]");
  });

  it("fails when every account is refused or the list is empty", async () => {
    const refused = fake((url) => (url.endsWith("/userAccountsData") ? accountsList("0111111111") : null));
    const r1 = await fetchDiscountAccounts(refused.fetchJson, START, NOW);
    expect(r1).toMatchObject({ success: false, failedAccounts: ["1111"] });
    const empty = fake(() => null);
    expect((await fetchDiscountAccounts(empty.fetchJson, START, NOW)).success).toBe(false);
  });

  it("treats a thrown fetch as a refused account", async () => {
    const { fetchJson } = fake((url) => {
      if (url.endsWith("/userAccountsData")) return accountsList("0111111111");
      throw new Error("boom https://start.telebank.co.il/x/0111111111");
    });
    const r = await fetchDiscountAccounts(fetchJson, START, NOW);
    expect(r.failedAccounts).toEqual(["1111"]);
    expect(r.messages.join(" ")).not.toContain("0111111111");
  });
});

describe("discountFromDate", () => {
  it("clamps to about one year back", () => {
    expect(discountFromDate(START, NOW)).toBe("20240501");
    expect(discountFromDate(new Date(2020, 0, 1), NOW)).toBe("20230603");
  });
});
