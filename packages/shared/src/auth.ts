import { z } from "zod";

/** Minimum password length; no composition rules (length matters more). */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `הסיסמה חייבת להכיל לפחות ${PASSWORD_MIN_LENGTH} תווים`)
  .max(PASSWORD_MAX_LENGTH, "הסיסמה ארוכה מדי");

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("כתובת אימייל לא תקינה");

/** POST /api/auth/register - creates the user plus a new household they own. */
export const registerInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1, "יש להזין שם").max(100),
  householdName: z.string().trim().min(1, "יש להזין שם למשק הבית").max(100),
});
export type RegisterInput = z.infer<typeof registerInputSchema>;

/** POST /api/auth/login */
export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "יש להזין סיסמה").max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const logoutResponseSchema = z.object({ ok: z.literal(true) });

/** POST /api/auth/invite-info - what an invite link is for (public; the token is the credential). */
export const inviteTokenInputSchema = z.object({ token: z.string().min(20).max(200) });
export const inviteInfoSchema = z.object({
  householdName: z.string(),
  email: z.string().email(),
  displayName: z.string(),
});
export type InviteInfo = z.infer<typeof inviteInfoSchema>;

/** POST /api/auth/accept-invite - sets the password, activates the membership, signs in. */
export const acceptInviteInputSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
  displayName: z.string().trim().min(1, "יש להזין שם").max(100).optional(),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteInputSchema>;
