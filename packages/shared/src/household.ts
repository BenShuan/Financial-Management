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
});
export type HouseholdMember = z.infer<typeof householdMemberSchema>;

/** Session context returned by GET /api/me - current user + household + role. */
export const sessionContextSchema = z.object({
  user: userSchema,
  household: householdSchema,
  role: householdRoleSchema,
});
export type SessionContext = z.infer<typeof sessionContextSchema>;
