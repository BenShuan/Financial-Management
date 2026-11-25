/**
 * Hebrew user-facing messages. Never echo raw scraper `errorMessage` or request values:
 * they may contain page text or input. Only fixed strings and the server's own Hebrew message.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** A local failure with a ready-to-show Hebrew message. */
export class LocalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalError";
  }
}

export const MSG = {
  invalidPassword: "פרטי הכניסה שגויים. עדכנו את פרטי הכניסה ושמרו מחדש.",
  changePassword: "הספק דורש החלפת סיסמה. החליפו סיסמה באתר הספק ועדכנו כאן.",
  accountBlocked: "החשבון אצל הספק חסום.",
  timeout: "תם הזמן להתחברות לאתר הספק. נסו שוב מאוחר יותר.",
  otp: "הספק דורש קוד אימות (OTP), שאינו נתמך בגרסה זו.",
  generic: "שגיאה באתר הספק (ייתכן שהאתר השתנה). נסו לעדכן את האפליקציה.",
  accountsRefused:
    "ההתחברות הצליחה, אך הספק סירב להחזיר תנועות לכל החשבונות. נסו שוב מאוחר יותר או בדקו באתר הספק שהחשבון פעיל.",
  noBrowser:"לא נמצא דפדפן Chrome או Edge במחשב. ניתן להגדיר נתיב בעזרת FM_BROWSER_PATH.",
  local: "שגיאה מקומית בהפעלת הדפדפן. נסו שוב.",
  sessionExpired: "החיבור לשרת פג תוקף. התחברו מחדש.",
  forbidden: "נדרשת הרשאת מנהל במשק הבית כדי להעלות תנועות.",
  notFound: "המשאב המבוקש לא נמצא בשרת.",
  notApiOrigin:
    "הכתובת שהוזנה אינה של שרת ה-API (כנראה זו כתובת אתר האינטרנט). יש להזין את כתובת ה-API, למשל http://localhost:8787 בפיתוח או כתובת ה-API ב-Render.",
  tooLarge: "יותר מדי תנועות בסנכרון אחד. יש לקצר את טווח הימים בהגדרות (lookbackDays).",
  network: "לא ניתן להתחבר לשרת.",
  server: "שגיאה בשרת. נסו שוב מאוחר יותר.",
  badResponse: "תשובה לא צפויה מהשרת.",
  notLoggedIn: "יש להתחבר לשרת לפני הסנכרון.",
  notAdmin: "נדרשת הרשאת מנהל או בעלים במשק הבית כדי לסנכרן.",
  alreadyRunning: "סנכרון כבר מתבצע.",
  vaultLocked: "יש לפתוח את הכספת המקומית.",
  wrongPassphrase: "סיסמת הכספת שגויה.",
  shortPassphrase: "סיסמת הכספת חייבת להכיל לפחות 8 תווים.",
  noProviders: "לא נשמרו פרטי כניסה לאף ספק.",
  invalidInput: "הנתונים שהוזנו אינם תקינים.",
} as const;

/** Map an israeli-bank-scrapers `errorType` (or our LOCAL_* codes) to Hebrew. */
export function scraperErrorMessage(errorType: string | undefined): string {
  const code = (errorType ?? "").toUpperCase();
  if (code === "INVALID_PASSWORD") return MSG.invalidPassword;
  if (code === "CHANGE_PASSWORD") return MSG.changePassword;
  if (code === "ACCOUNT_BLOCKED") return MSG.accountBlocked;
  if (code === "TIMEOUT") return MSG.timeout;
  if (code.includes("TWO_FACTOR") || code.includes("OTP")) return MSG.otp;
  if (code === "ACCOUNTS_REFUSED") return MSG.accountsRefused;
  if (code === "LOCAL_NO_BROWSER")return MSG.noBrowser;
  if (code === "LOCAL_ERROR") return MSG.local;
  return MSG.generic;
}

/** Map an API status + server message to Hebrew. 400/409/429 keep the server's Hebrew message. */
export function apiErrorMessage(status: number, serverMessage?: string): string {
  if (status === 0) return MSG.network;
  if (status === 401) return MSG.sessionExpired;
  if (status === 403) return MSG.forbidden;
  if (status === 404) return MSG.notFound;
  if (status === 413) return MSG.tooLarge;
  if (status === 400 || status === 409 || status === 429) return serverMessage?.slice(0, 200) || MSG.badResponse;
  return MSG.server;
}

/** Message for any thrown error, without leaking unknown error text. */
export function toUserMessage(err: unknown): string {
  if (err instanceof ApiError || err instanceof LocalError) return err.message;
  return MSG.generic;
}
