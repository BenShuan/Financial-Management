import type { HouseholdRole } from "@financial-management/shared";

/** Auth context resolved per request (dev stub now, real sessions later). */
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
