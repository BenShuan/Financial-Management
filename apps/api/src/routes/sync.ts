import { createRoute, z } from "@hono/zod-openapi";
import { and, asc, desc, eq } from "drizzle-orm";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import {
  accountNumberLast4,
  type BankSyncUploadAccountResult,
  bankSyncUploadResultSchema,
  bankSyncUploadSchema,
  syncAccountLinkSchema,
  updateSyncAccountLinkSchema,
} from "@financial-management/shared";
import { db } from "../db/index.js";
import { accounts, syncAccountLinks } from "../db/schema.js";
import { emitAuditEvent } from "../lib/audit.js";
import { applyBankSyncAccount } from "../lib/bank-sync-import.js";
import { mapScrapedAccount } from "../lib/bank-sync-mapper.js";
import { createRouter } from "../lib/router.js";
import { requireRole } from "../middleware/auth.js";
import { getHouseholdAccount } from "./accounts.js";

/**
 * Bank / credit-card auto-fetch (FM-29). The local app `apps/bank-sync` scrapes on the user's
 * computer and uploads here; no endpoint ever accepts bank credentials. Provider account numbers
 * are mapped to household accounts through `sync_account_links` (linked by an admin in the web app).
 */

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

type LinkRow = typeof syncAccountLinks.$inferSelect;

function serializeLink(row: LinkRow) {
  return {
    syncAccountLinkId: row.syncAccountLinkId,
    provider: row.provider,
    externalAccountNumber: row.externalAccountNumber,
    status: row.status,
    accountId: row.accountId,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
  };
}


export const syncRouter = createRouter();

syncRouter.use(
  "/api/sync/uploads",
  bodyLimit({
    maxSize: MAX_UPLOAD_BYTES,
    onError: (c) =>
      c.json(
        {
          error: "payload_too_large",
          message: "יותר מדי תנועות בסנכרון אחד; יש לקצר את טווח הימים בהגדרות",
        },
        413,
      ),
  }),
);

syncRouter.openapi(
  createRoute({
    method: "post",
    path: "/api/sync/uploads",
    tags: ["Bank sync"],
    summary:
      "Upload one provider's scraped accounts from the local bank-sync app; linked accounts are imported (admin+)",
    request: {
      body: { content: { "application/json": { schema: bankSyncUploadSchema } } },
    },
    responses: {
      200: {
        description: "Per-account result (links discovered, rows created, duplicates skipped)",
        content: { "application/json": { schema: bankSyncUploadResultSchema } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    requireRole(auth, "admin");
    const input = c.req.valid("json");
    const results: BankSyncUploadAccountResult[] = [];

    for (const scraped of input.accounts) {
      const now = new Date();
      const [link] = await db
        .insert(syncAccountLinks)
        .values({
          householdId: auth.householdId,
          provider: input.provider,
          externalAccountNumber: scraped.accountNumber,
          firstSeenAt: now,
          lastSeenAt: now,
        })
        .onConflictDoUpdate({
          target: [
            syncAccountLinks.householdId,
            syncAccountLinks.provider,
            syncAccountLinks.externalAccountNumber,
          ],
          set: { lastSeenAt: now },
        })
        .returning();
      if (!link) throw new HTTPException(500, { message: "שמירת החשבון לסנכרון נכשלה" });

      const result: BankSyncUploadAccountResult = {
        accountNumber: scraped.accountNumber,
        linkId: link.syncAccountLinkId,
        status: link.status,
        accountId: link.accountId,
        importBatchId: null,
        received: scraped.txns.length,
        created: 0,
        duplicates: 0,
        skippedPending: 0,
        skippedInvalid: 0,
        skippedForeign: 0,
        error: null,
      };

      if (link.status === "linked" && link.accountId) {
        const [account] = await db
          .select({ isActive: accounts.isActive })
          .from(accounts)
          .where(
            and(
              eq(accounts.accountId, link.accountId),
              eq(accounts.householdId, auth.householdId),
            ),
          );
        if (!account || !account.isActive) {
          result.error = "החשבון המשויך אינו פעיל; יש לשייך חשבון אחר באפליקציית הווב";
        } else {
          const mapped = mapScrapedAccount(input.provider, scraped.accountNumber, scraped.txns);
          result.skippedPending = mapped.skippedPending;
          result.skippedInvalid = mapped.skippedInvalid;
          result.skippedForeign = mapped.skippedForeign;
          try {
            const applied = await applyBankSyncAccount(auth, {
              accountId: link.accountId,
              provider: input.provider,
              accountNumber: scraped.accountNumber,
              rows: mapped.rows,
            });
            result.importBatchId = applied.importBatchId;
            result.created = applied.created;
            result.duplicates = applied.duplicates;
          } catch (err) {
            // One account's failure must not block the others; log without payload details.
            console.error("bank sync apply failed", err instanceof Error ? err.message : err);
            result.error = "שגיאה בשמירת התנועות";
          }
        }
      }
      results.push(result);
    }

    return c.json({ accounts: results }, 200);
  },
);

syncRouter.openapi(
  createRoute({
    method: "get",
    path: "/api/sync/account-links",
    tags: ["Bank sync"],
    summary: "Provider accounts discovered by bank sync and their link to household accounts",
    responses: {
      200: {
        description: "Account links",
        content: { "application/json": { schema: z.array(syncAccountLinkSchema) } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    const rows = await db
      .select()
      .from(syncAccountLinks)
      .where(eq(syncAccountLinks.householdId, auth.householdId))
      .orderBy(asc(syncAccountLinks.provider), desc(syncAccountLinks.lastSeenAt));
    return c.json(rows.map(serializeLink), 200);
  },
);

const linkIdParam = z.object({ syncAccountLinkId: z.string().uuid() });

syncRouter.openapi(
  createRoute({
    method: "patch",
    path: "/api/sync/account-links/{syncAccountLinkId}",
    tags: ["Bank sync"],
    summary: "Link a provider account to a household account, ignore it, or unlink it (admin+)",
    request: {
      params: linkIdParam,
      body: { content: { "application/json": { schema: updateSyncAccountLinkSchema } } },
    },
    responses: {
      200: {
        description: "Updated link",
        content: { "application/json": { schema: syncAccountLinkSchema } },
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    requireRole(auth, "admin");
    const { syncAccountLinkId } = c.req.valid("param");
    const input = c.req.valid("json");

    const [before] = await db
      .select()
      .from(syncAccountLinks)
      .where(
        and(
          eq(syncAccountLinks.syncAccountLinkId, syncAccountLinkId),
          eq(syncAccountLinks.householdId, auth.householdId),
        ),
      );
    if (!before) throw new HTTPException(404, { message: "החשבון לסנכרון לא נמצא" });

    let accountId: string | null = null;
    if (input.status === "linked") {
      const account = await getHouseholdAccount(auth.householdId, input.accountId);
      if (!account.isActive) {
        throw new HTTPException(400, { message: "לא ניתן לשייך לחשבון שאינו פעיל" });
      }
      accountId = account.accountId;
    }

    const [row] = await db
      .update(syncAccountLinks)
      .set({ status: input.status, accountId })
      .where(eq(syncAccountLinks.syncAccountLinkId, syncAccountLinkId))
      .returning();
    if (!row) throw new HTTPException(500, { message: "עדכון החשבון לסנכרון נכשל" });

    await emitAuditEvent(auth, {
      actionType: "sync_account_link.updated",
      entityType: "sync_account_link",
      entityId: syncAccountLinkId,
      before: {
        status: before.status,
        accountId: before.accountId,
        last4: accountNumberLast4(before.externalAccountNumber),
      },
      after: { status: row.status, accountId: row.accountId, last4: accountNumberLast4(row.externalAccountNumber) },
    });
    return c.json(serializeLink(row), 200);
  },
);
