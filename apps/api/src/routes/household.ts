import { createHash, randomBytes } from "node:crypto";
import { createRoute, z } from "@hono/zod-openapi";
import { and, asc, eq, ne } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  householdMemberSchema,
  inviteMemberInputSchema,
  inviteMemberResultSchema,
  removeMemberResultSchema,
  updateMemberRoleInputSchema,
  type HouseholdMember,
  type HouseholdRole,
} from "@financial-management/shared";
import { db } from "../db/index.js";
import { householdMembers, sessions, users } from "../db/schema.js";
import { emitAuditEvent } from "../lib/audit.js";
import { createRouter } from "../lib/router.js";
import { requireRole, ROLE_RANK } from "../middleware/auth.js";
import type { AuthContext } from "../types.js";

export const householdRouter = createRouter();

/** How long an invite link stays valid. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const hashInviteToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

const memberIdParam = z.object({ memberId: z.string().uuid() });
const json = <T extends z.ZodTypeAny>(schema: T) => ({ "application/json": { schema } });

const memberSelect = {
  householdMemberId: householdMembers.householdMemberId,
  householdId: householdMembers.householdId,
  userId: householdMembers.userId,
  role: householdMembers.role,
  status: householdMembers.status,
  joinedAt: householdMembers.joinedAt,
  inviteExpiresAt: householdMembers.inviteExpiresAt,
  displayName: users.displayName,
  email: users.email,
};

function serializeMember(row: {
  householdMemberId: string;
  householdId: string;
  userId: string;
  role: HouseholdRole;
  status: "active" | "invited" | "removed";
  joinedAt: Date | null;
  inviteExpiresAt: Date | null;
  displayName: string;
  email: string;
}): HouseholdMember {
  return {
    householdMemberId: row.householdMemberId,
    householdId: row.householdId,
    userId: row.userId,
    role: row.role,
    status: row.status,
    joinedAt: row.joinedAt?.toISOString() ?? null,
    inviteExpiresAt: row.status === "invited" ? (row.inviteExpiresAt?.toISOString() ?? null) : null,
    displayName: row.displayName,
    email: row.email,
  };
}

async function loadMember(householdId: string, memberId: string) {
  const [row] = await db
    .select(memberSelect)
    .from(householdMembers)
    .innerJoin(users, eq(users.userId, householdMembers.userId))
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.householdMemberId, memberId),
      ),
    );
  return row ? serializeMember(row) : null;
}

/**
 * Authorization for managing members (docs/agent/05): admin+ only. Admins can manage and assign
 * roles strictly below their own (so only an owner touches admins/owners or grants owner);
 * owners can do anything, subject to the last-owner rule enforced by the callers.
 */
function assertCanManage(
  auth: AuthContext,
  target: { role: HouseholdRole } | null,
  newRole?: HouseholdRole,
) {
  requireRole(auth, "admin");
  if (auth.role === "owner") return;
  if (target && ROLE_RANK[target.role] >= ROLE_RANK[auth.role]) {
    throw new HTTPException(403, { message: "אין לך הרשאה לנהל חבר בדרגה זו" });
  }
  if (newRole && ROLE_RANK[newRole] > ROLE_RANK[auth.role]) {
    throw new HTTPException(403, { message: "אין לך הרשאה להעניק תפקיד זה" });
  }
}

const LAST_OWNER = "לא ניתן להסיר או להוריד את הבעלים האחרון של משק הבית";

householdRouter.openapi(
  createRoute({
    method: "get",
    path: "/api/household/members",
    tags: ["Household"],
    summary: "List active and invited members (any member)",
    responses: {
      200: {
        description: "Members",
        content: json(z.array(householdMemberSchema)),
      },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    const rows = await db
      .select(memberSelect)
      .from(householdMembers)
      .innerJoin(users, eq(users.userId, householdMembers.userId))
      .where(
        and(
          eq(householdMembers.householdId, auth.householdId),
          ne(householdMembers.status, "removed"),
        ),
      )
      .orderBy(asc(householdMembers.joinedAt), asc(users.displayName));
    return c.json(rows.map(serializeMember), 200);
  },
);

householdRouter.openapi(
  createRoute({
    method: "post",
    path: "/api/household/members/invite",
    tags: ["Household"],
    summary: "Invite a member by email (admin+); returns a one-time link token",
    request: { body: { content: json(inviteMemberInputSchema), required: true } },
    responses: {
      201: { description: "Invited", content: json(inviteMemberResultSchema) },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    const input = c.req.valid("json");
    assertCanManage(auth, null, input.role);

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const memberId = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(users).where(eq(users.email, input.email));
      // v1: a user belongs to one household. Registered accounts (with a password) cannot be invited.
      if (existing?.passwordHash) {
        throw new HTTPException(409, { message: "כתובת האימייל כבר רשומה במערכת" });
      }
      const user =
        existing ??
        (
          await tx
            .insert(users)
            .values({ email: input.email, displayName: input.displayName })
            .returning()
        )[0]!;

      const [current] = await tx
        .select()
        .from(householdMembers)
        .where(
          and(
            eq(householdMembers.householdId, auth.householdId),
            eq(householdMembers.userId, user.userId),
          ),
        );
      if (current?.status === "active") {
        throw new HTTPException(409, { message: "המשתמש כבר חבר במשק הבית" });
      }
      if (current && ROLE_RANK[current.role] >= ROLE_RANK[auth.role] && auth.role !== "owner") {
        throw new HTTPException(403, { message: "אין לך הרשאה לנהל חבר בדרגה זו" });
      }
      const fields = {
        role: input.role,
        status: "invited" as const,
        invitedBy: auth.userId,
        inviteTokenHash: hashInviteToken(token),
        inviteExpiresAt: expiresAt,
      };
      if (current) {
        await tx
          .update(householdMembers)
          .set(fields)
          .where(eq(householdMembers.householdMemberId, current.householdMemberId));
        return current.householdMemberId;
      }
      const [created] = await tx
        .insert(householdMembers)
        .values({ householdId: auth.householdId, userId: user.userId, ...fields })
        .returning({ id: householdMembers.householdMemberId });
      return created!.id;
    });

    await emitAuditEvent(auth, {
      actionType: "household.member_invited",
      entityType: "household_member",
      entityId: memberId,
      after: { role: input.role, email: input.email },
    });
    const member = (await loadMember(auth.householdId, memberId))!;
    return c.json(
      { member, inviteToken: token, inviteExpiresAt: expiresAt.toISOString() },
      201,
    );
  },
);

householdRouter.openapi(
  createRoute({
    method: "patch",
    path: "/api/household/members/{memberId}",
    tags: ["Household"],
    summary: "Change a member's role (admin+; never demotes the last owner)",
    request: {
      params: memberIdParam,
      body: { content: json(updateMemberRoleInputSchema), required: true },
    },
    responses: { 200: { description: "Updated", content: json(householdMemberSchema) } },
  }),
  async (c) => {
    const auth = c.get("auth");
    const { memberId } = c.req.valid("param");
    const { role } = c.req.valid("json");

    const before = await db.transaction(async (tx) => {
      // Lock the household's member rows so two concurrent demotions cannot both pass the owner count.
      const rows = await tx
        .select()
        .from(householdMembers)
        .where(eq(householdMembers.householdId, auth.householdId))
        .for("update");
      const target = rows.find(
        (r) => r.householdMemberId === memberId && r.status !== "removed",
      );
      if (!target) throw new HTTPException(404, { message: "החבר לא נמצא" });
      assertCanManage(auth, target, role);
      if (target.role === role) return target;

      const activeOwners = rows.filter((r) => r.role === "owner" && r.status === "active").length;
      if (target.role === "owner" && target.status === "active" && activeOwners <= 1) {
        throw new HTTPException(409, { message: LAST_OWNER });
      }
      await tx
        .update(householdMembers)
        .set({ role })
        .where(eq(householdMembers.householdMemberId, memberId));
      return target;
    });

    if (before.role !== role) {
      await emitAuditEvent(auth, {
        actionType: "household.member_role_changed",
        entityType: "household_member",
        entityId: memberId,
        before: { role: before.role },
        after: { role },
      });
    }
    return c.json((await loadMember(auth.householdId, memberId))!, 200);
  },
);

householdRouter.openapi(
  createRoute({
    method: "delete",
    path: "/api/household/members/{memberId}",
    tags: ["Household"],
    summary: "Remove a member or revoke an invite (admin+; any member can leave; never the last owner)",
    request: { params: memberIdParam },
    responses: { 200: { description: "Removed", content: json(removeMemberResultSchema) } },
  }),
  async (c) => {
    const auth = c.get("auth");
    const { memberId } = c.req.valid("param");

    const target = await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(householdMembers)
        .where(eq(householdMembers.householdId, auth.householdId))
        .for("update");
      const row = rows.find((r) => r.householdMemberId === memberId && r.status !== "removed");
      if (!row) throw new HTTPException(404, { message: "החבר לא נמצא" });
      if (row.userId !== auth.userId) assertCanManage(auth, row);

      const activeOwners = rows.filter((r) => r.role === "owner" && r.status === "active").length;
      if (row.role === "owner" && row.status === "active" && activeOwners <= 1) {
        throw new HTTPException(409, { message: LAST_OWNER });
      }
      await tx
        .update(householdMembers)
        .set({ status: "removed", inviteTokenHash: null, inviteExpiresAt: null })
        .where(eq(householdMembers.householdMemberId, memberId));
      // Cut off any live sessions into this household right away.
      await tx
        .delete(sessions)
        .where(and(eq(sessions.userId, row.userId), eq(sessions.householdId, auth.householdId)));
      return row;
    });

    await emitAuditEvent(auth, {
      actionType: "household.member_removed",
      entityType: "household_member",
      entityId: memberId,
      before: { role: target.role, status: target.status },
    });
    return c.json({ removed: true as const }, 200);
  },
);
