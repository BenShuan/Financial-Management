import type { BankSyncProvider } from "@financial-management/shared";

export interface CredentialField {
  key: string;
  label: string;
}

export interface ProviderDef {
  /** israeli-bank-scrapers CompanyTypes value (equals the key). */
  companyId: string;
  kind: "bank" | "card";
  label: string;
  fields: readonly CredentialField[];
}

/** Supported providers (v1, no OTP). Credential field names match israeli-bank-scrapers. */
export const PROVIDERS: Record<BankSyncProvider, ProviderDef> = {
  discount: {
    companyId: "discount",
    kind: "bank",
    label: "בנק דיסקונט",
    fields: [
      { key: "id", label: "תעודת זהות" },
      { key: "password", label: "סיסמה" },
      { key: "num", label: "קוד משתמש" },
    ],
  },
  isracard: {
    companyId: "isracard",
    kind: "card",
    label: "ישראכרט",
    fields: [
      { key: "id", label: "תעודת זהות" },
      { key: "card6Digits", label: "6 ספרות אחרונות של הכרטיס" },
      { key: "password", label: "סיסמה" },
    ],
  },
  max: {
    companyId: "max",
    kind: "card",
    label: "מקס",
    fields: [
      { key: "username", label: "שם משתמש" },
      { key: "password", label: "סיסמה" },
    ],
  },
};
