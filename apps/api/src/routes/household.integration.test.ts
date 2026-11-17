import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { HouseholdRole } from "@financial-management/shared";
import { createHarness, TEST_DATABASE_URL, type Harness } from "../test/harness.js";
import type { AuthContext } from "../types.js";

/** Members, invite links and role management (FM-7): authorization, last-owner rule, audit. */
describe.skipIf(!TEST_DATABASE_URL)("household members API (Postgres)", () => {
  let h: Harness;
  let current: AuthContext;
  let app: ReturnType<Harness["appFor"]>;
  let authApp: ReturnType<Harness["appFor"]>;

  const PASSWORD = "correct-horse-battery";
  const asUser = (a: AuthContext) => {
    current = a;
  };

  /** A fresh household whose owner is the acting user. */
  async function household(role: HouseholdRole = "owner") {
    const auth = await h.createHousehold(role);
    asUser(auth);
    return auth;
  }
  /** Adds an active member with `role` directly (bypassing the invite flow). */
  async function addMember(householdId: string, role: HouseholdRole): Promise<AuthContext & { memberId: string }> {
    const [user] = await h.db
      .insert(h.schema.users)
      .values({ email: `test-${randomUUID()}@example.test`, displayName: `חבר ${role}` })
      .returning();
    h.trackUser(user!.userId);
    const [member] = await h.db
      .insert(h.schema.householdMembers)
      .values({ householdId, userId: user!.userId, role, status: "active", joinedAt: new Date() })
      .returning();
    return { userId: user!.userId, householdId, role, memberId: member!.householdMemberId };
  }
  const invite = (body: object) => app.request("/api/household/members/invite", h.json("POST", body));
  const newInvite = (role: HouseholdRole = "member") => ({
    email: `Test-${randomUUID()}@Example.test`,
    displayName: "מוזמן",
    role,
  });
  const changeRole = (memberId: string, role: HouseholdRole) =>
    app.request(`/api/household/members/${memberId}`, h.json("PATCH", { role }));
  const remove = (memberId: string) =>
    app.request(`/api/household/members/${memberId}`, { method: "DELETE" });
  const listMembers = async () =>
    (await (await app.request("/api/household/members")).json()) as {
      householdMemberId: string;
      status: string;
      role: string;
      email: string;
      inviteExpiresAt: string | null;
    }[];
  async function audit(entityId: string, actionType: string) {
    const { and, eq } = await import("drizzle-orm");
    return h.db
      .select()
      .from(h.schema.auditEvents)
      .where(
        and(
          eq(h.schema.auditEvents.entityId, entityId),
          eq(h.schema.auditEvents.actionType, actionType),
        ),
      );
  }
  async function memberRow(memberId: string) {
    const { eq } = await import("drizzle-orm");
    const [row] = await h.db
      .select()
      .from(h.schema.householdMembers)
      .where(eq(h.schema.householdMembers.householdMemberId, memberId));
    return row!;
  }

  beforeAll(async () => {
    h = await createHarness();
    app = h.appFor((await import("./household.js")).householdRouter, () => current);
    authApp = h.appFor((await import("./auth.js")).authRouter, () => current);
  });

  afterAll(async () => {
    if (h) await h.cleanup();
  });

  describe("invite links", () => {
    it("creates an invited member with a one-time token, audits it and lists it", async () => {
      const owner = await household();
      const body = newInvite("member");
      const res = await invite(body);
      expect(res.status).toBe(201);
      const result = (await res.json()) as {
        member: { householdMemberId: string; status: string; email: string; role: string };
        inviteToken: string;
        inviteExpiresAt: string;
      };
      expect(result.member).toMatchObject({
        status: "invited",
        role: "member",
        email: body.email.toLowerCase(),
      });
      expect(result.inviteToken.length).toBeGreaterThan(20);
      expect(new Date(result.inviteExpiresAt).getTime()).toBeGreaterThan(Date.now());
      // Only the hash is stored, never the token itself
      const row = await memberRow(result.member.householdMemberId);
      expect(row.inviteTokenHash).not.toBeNull();
      expect(row.inviteTokenHash).not.toBe(result.inviteToken);
      expect(row.invitedBy).toBe(owner.userId);
      expect(await audit(result.member.householdMemberId, "household.member_invited")).toHaveLength(1);
      expect((await listMembers()).map((m) => m.status).sort()).toEqual(["active", "invited"]);
    });

    it("only admins and owners can invite; admins cannot grant owner", async () => {
      const owner = await household();
      const admin = await addMember(owner.householdId, "admin");
      const member = await addMember(owner.householdId, "member");
      asUser(member);
      expect((await invite(newInvite("viewer"))).status).toBe(403);
      asUser(admin);
      expect((await invite(newInvite("owner"))).status).toBe(403);
      expect((await invite(newInvite("viewer"))).status).toBe(201);
      expect((await invite(newInvite("admin"))).status).toBe(201);
    });

    it("rejects an email that already has a registered account", async () => {
      await household();
      const [user] = await h.db
        .insert(h.schema.users)
        .values({
          email: `test-${randomUUID()}@example.test`,
          displayName: "רשום",
          passwordHash: "scrypt$x",
        })
        .returning();
      h.trackUser(user!.userId);
      const res = await invite({ email: user!.email, displayName: "x", role: "member" });
      expect(res.status).toBe(409);
    });

    it("a second invite for the same email rotates the token", async () => {
      await household();
      const body = newInvite();
      const first = (await (await invite(body)).json()) as { inviteToken: string };
      const second = (await (await invite(body)).json()) as { inviteToken: string };
      expect(second.inviteToken).not.toBe(first.inviteToken);
      const old = await authApp.request("/api/auth/invite-info", h.json("POST", { token: first.inviteToken }));
      expect(old.status).toBe(400);
      const fresh = await authApp.request("/api/auth/invite-info", h.json("POST", { token: second.inviteToken }));
      expect(fresh.status).toBe(200);
      expect((await listMembers()).filter((m) => m.status === "invited")).toHaveLength(1);
    });

    it("describes a valid link and rejects unknown ones", async () => {
      await household();
      const { inviteToken } = (await (await invite(newInvite())).json()) as { inviteToken: string };
      const ok = await authApp.request("/api/auth/invite-info", h.json("POST", { token: inviteToken }));
      expect(ok.status).toBe(200);
      expect(await ok.json()).toMatchObject({ displayName: "מוזמן" });
      const bad = await authApp.request(
        "/api/auth/invite-info",
        h.json("POST", { token: "x".repeat(43) }),
      );
      expect(bad.status).toBe(400);
    });

    it("accepting sets the password, activates the member, signs in and burns the token", async () => {
      const owner = await household();
      const { member, inviteToken } = (await (await invite(newInvite("admin"))).json()) as {
        member: { householdMemberId: string; userId: string };
        inviteToken: string;
      };
      const res = await authApp.request(
        "/api/auth/accept-invite",
        h.json("POST", { token: inviteToken, password: PASSWORD }),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("set-cookie")).toContain("fm_session=");
      expect(await res.json()).toMatchObject({ role: "admin" });
      const row = await memberRow(member.householdMemberId);
      expect(row).toMatchObject({ status: "active", inviteTokenHash: null, inviteExpiresAt: null });
      expect(row.joinedAt).not.toBeNull();
      const { eq } = await import("drizzle-orm");
      const [user] = await h.db
        .select()
        .from(h.schema.users)
        .where(eq(h.schema.users.userId, member.userId));
      expect(user?.passwordHash).toBeTruthy();
      expect(await audit(member.householdMemberId, "household.invite_accepted")).toHaveLength(1);
      // The same link cannot be used twice
      const again = await authApp.request(
        "/api/auth/accept-invite",
        h.json("POST", { token: inviteToken, password: PASSWORD }),
      );
      expect(again.status).toBe(400);
      expect(owner.householdId).toBe(row.householdId);
    });

    it("rejects an expired link and a weak password", async () => {
      await household();
      const { member, inviteToken } = (await (await invite(newInvite())).json()) as {
        member: { householdMemberId: string };
        inviteToken: string;
      };
      const weak = await authApp.request(
        "/api/auth/accept-invite",
        h.json("POST", { token: inviteToken, password: "short" }),
      );
      expect(weak.status).toBe(400);
      const { eq } = await import("drizzle-orm");
      await h.db
        .update(h.schema.householdMembers)
        .set({ inviteExpiresAt: new Date(Date.now() - 1000) })
        .where(eq(h.schema.householdMembers.householdMemberId, member.householdMemberId));
      const expired = await authApp.request(
        "/api/auth/accept-invite",
        h.json("POST", { token: inviteToken, password: PASSWORD }),
      );
      expect(expired.status).toBe(400);
    });
  });

  describe("role changes", () => {
    it("lets an owner promote a member and records before/after in the audit log", async () => {
      const owner = await household();
      const member = await addMember(owner.householdId, "member");
      const res = await changeRole(member.memberId, "admin");
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ role: "admin" });
      const [event] = await audit(member.memberId, "household.member_role_changed");
      expect(event?.beforeSnapshot).toEqual({ role: "member" });
      expect(event?.afterSnapshot).toEqual({ role: "admin" });
    });

    it("does not audit a no-op change", async () => {
      const owner = await household();
      const member = await addMember(owner.householdId, "member");
      expect((await changeRole(member.memberId, "member")).status).toBe(200);
      expect(await audit(member.memberId, "household.member_role_changed")).toHaveLength(0);
    });

    it("enforces the role hierarchy on the server", async () => {
      const owner = await household();
      const admin = await addMember(owner.householdId, "admin");
      const otherAdmin = await addMember(owner.householdId, "admin");
      const member = await addMember(owner.householdId, "member");
      const viewer = await addMember(owner.householdId, "viewer");
      asUser(viewer);
      expect((await changeRole(member.memberId, "viewer")).status).toBe(403);
      asUser(member);
      expect((await changeRole(viewer.memberId, "member")).status).toBe(403);
      asUser(admin);
      expect((await changeRole(otherAdmin.memberId, "member")).status).toBe(403); // peer admin
      expect((await changeRole(member.memberId, "owner")).status).toBe(403); // cannot grant owner
      expect((await changeRole(member.memberId, "viewer")).status).toBe(200);
      const ownerMember = (await listMembers()).find((m) => m.role === "owner")!;
      expect((await changeRole(ownerMember.householdMemberId, "member")).status).toBe(403);
    });

    it("never demotes the last owner, but can once another owner exists", async () => {
      const owner = await household();
      const ownerMember = (await listMembers()).find((m) => m.role === "owner")!;
      expect((await changeRole(ownerMember.householdMemberId, "admin")).status).toBe(409);
      expect((await memberRow(ownerMember.householdMemberId)).role).toBe("owner");
      const second = await addMember(owner.householdId, "owner");
      expect((await changeRole(ownerMember.householdMemberId, "admin")).status).toBe(200);
      // `second` is now the only owner and is protected
      asUser(second);
      expect((await changeRole(second.memberId, "member")).status).toBe(409);
    });

    it("404s for a member of another household", async () => {
      await household();
      const other = await h.createHousehold("owner");
      const otherMember = await addMember(other.householdId, "member");
      expect((await changeRole(otherMember.memberId, "viewer")).status).toBe(404);
    });
  });

  describe("removal", () => {
    it("removes a member, ends their sessions, hides them from the list and audits it", async () => {
      const owner = await household();
      const member = await addMember(owner.householdId, "member");
      await h.db.insert(h.schema.sessions).values({
        tokenHash: randomUUID(),
        userId: member.userId,
        householdId: owner.householdId,
        expiresAt: new Date(Date.now() + 60_000),
      });
      expect((await remove(member.memberId)).status).toBe(200);
      expect((await memberRow(member.memberId)).status).toBe("removed");
      const { eq } = await import("drizzle-orm");
      expect(
        await h.db.select().from(h.schema.sessions).where(eq(h.schema.sessions.userId, member.userId)),
      ).toHaveLength(0);
      expect((await listMembers()).some((m) => m.householdMemberId === member.memberId)).toBe(false);
      expect(await audit(member.memberId, "household.member_removed")).toHaveLength(1);
      expect((await remove(member.memberId)).status).toBe(404);
    });

    it("revokes a pending invite", async () => {
      await household();
      const { member, inviteToken } = (await (await invite(newInvite())).json()) as {
        member: { householdMemberId: string };
        inviteToken: string;
      };
      expect((await remove(member.householdMemberId)).status).toBe(200);
      const res = await authApp.request("/api/auth/invite-info", h.json("POST", { token: inviteToken }));
      expect(res.status).toBe(400);
    });

    it("refuses to remove the last owner, including by themselves", async () => {
      const owner = await household();
      const ownerMember = (await listMembers()).find((m) => m.role === "owner")!;
      expect((await remove(ownerMember.householdMemberId)).status).toBe(409);
      const admin = await addMember(owner.householdId, "admin");
      asUser(admin);
      expect((await remove(ownerMember.householdMemberId)).status).toBe(403);
    });

    it("lets any member leave, but viewers cannot remove others", async () => {
      const owner = await household();
      const viewer = await addMember(owner.householdId, "viewer");
      const member = await addMember(owner.householdId, "member");
      asUser(viewer);
      expect((await remove(member.memberId)).status).toBe(403);
      expect((await remove(viewer.memberId)).status).toBe(200);
    });
  });
});
