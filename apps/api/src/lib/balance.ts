import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { accounts } from "../db/schema.js";

/**
 * Recomputes current_balance for an account from its ledger (server is the only
 * place balance math lives): opening + income − expense + transfers in − transfers out.
 * Pending transactions are included; reconciliation separately uses cleared-only.
 */
export async function recalcAccountBalance(accountId: string): Promise<string> {
  const result = await db.execute(sql`
    SELECT (
      a.opening_balance
      + COALESCE((SELECT SUM(t.amount) FROM transactions t
          WHERE t.account_id = a.account_id AND t.type = 'income'), 0)
      - COALESCE((SELECT SUM(t.amount) FROM transactions t
          WHERE t.account_id = a.account_id AND t.type = 'expense'), 0)
      + COALESCE((SELECT SUM(t.amount) FROM transactions t
          JOIN transfer_links l ON l.to_transaction_id = t.transaction_id
          WHERE t.account_id = a.account_id), 0)
      - COALESCE((SELECT SUM(t.amount) FROM transactions t
          JOIN transfer_links l ON l.from_transaction_id = t.transaction_id
          WHERE t.account_id = a.account_id), 0)
    )::numeric(18,2) AS balance
    FROM accounts a
    WHERE a.account_id = ${accountId}
  `);
  const balance = (result.rows[0]?.balance as string | undefined) ?? "0.00";
  await db
    .update(accounts)
    .set({ currentBalance: balance })
    .where(eq(accounts.accountId, accountId));
  return balance;
}
