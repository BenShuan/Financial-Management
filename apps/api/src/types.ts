import type { HouseholdRole } from "@financial-management/shared";

/** Auth context resolved per request (from the session cookie). */
export interface AuthContext {
  userId: string;
  householdId: string;
  role: HouseholdRole;
}

export type AppEnv = {
  Variables: {
    auth: AuthContext;
  };
};
