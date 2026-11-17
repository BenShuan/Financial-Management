import { z } from "zod";
import { householdRoleSchema, householdStatusSchema, memberStatusSchema } from "./enums.js";

export const householdSchema = z.object({
  householdId: z.string().uuid(),
  name: z.string(),
  baseCurrency: z.string().length(3),
  timezone: z.string(),
  status: householdStatusSchema,
  createdAt: z.string(),
});
export type Household = z.infer<typeof householdSchema>;

export const userSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  createdAt: z.string(),
});
export type User = z.infer<typeof userSchema>;

export const householdMemberSchema = z.object({
  householdMemberId: z.string().uuid(),
  householdId: z.string().uuid(),
  userId: z.string().uuid(),
  role: householdRoleSchema,
  status: memberStatusSchema,
  joinedAt: z.string().nullable(),
  displayName: z.string(),
  email: z.string().email(),
  /** Only while status = invited: when the invite link stops working. */
  inviteExpiresAt: z.string().nullable(),
});
export type HouseholdMember = z.infer<typeof householdMemberSchema>;

/** POST /api/household/members/invite */
export const inviteMemberInputSchema = z.object({
  email: z.string().trim().toLowerCase().email("כתובת אימייל לא תקינה"),
  displayName: z.string().trim().min(1, "יש להזין שם").max(100),
  role: householdRoleSchema,
});
export type InviteMemberInput = z.infer<typeof inviteMemberInputSchema>;

/** The token is shown once; only its hash is stored. The web app builds the link from it. */
export const inviteMemberResultSchema = z.object({
  member: householdMemberSchema,
  inviteToken: z.string(),
  inviteExpiresAt: z.string(),
});
export type InviteMemberResult = z.infer<typeof inviteMemberResultSchema>;

/** PATCH /api/household/members/{memberId} */
export const updateMemberRoleInputSchema = z.object({ role: householdRoleSchema });
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleInputSchema>;

export const removeMemberResultSchema = z.object({ removed: z.literal(true) });

/** Session context returned by GET /api/me - current user + household + role. */
export const sessionContextSchema = z.object({
  user: userSchema,
  household: householdSchema,
  role: householdRoleSchema,
});
export type SessionContext = z.infer<typeof sessionContextSchema>;
