/**
 * Dev seed: one household + owner, Hebrew seeded categories (docs/agent/03),
 * sample accounts/transactions, an active budget period, and recurring items.
 * Idempotent: skips if the dev household already exists.
 */
import { eq } from "drizzle-orm";
import { db } from "./index.js";
import {
  accounts,
  budgetLines,
  budgetPeriods,
  categories,
  householdMembers,
  households,
  recurringOccurrences,
  recurringTemplates,
  tags,
  transactions,
  transferLinks,
  users,
} from "./schema.js";

const DEV_EMAIL = "dev@hearth.local";

// Category colors are design-token names; the web app maps them to classes.
type SeedCategory = {
  name: string;
  kind: "income" | "expense";
  color: string;
  children?: string[];
};

const SEED_CATEGORIES: SeedCategory[] = [
  { name: "משכורת", kind: "income", color: "positive" },
  { name: "בונוס", kind: "income", color: "positive" },
  { name: "הכנסות מהשקעות", kind: "income", color: "info" },
  { name: "הכנסה אחרת", kind: "income", color: "positive" },
  { name: "דיור", kind: "expense", color: "primary", children: ["שכירות / משכנתא", "תחזוקת בית"] },
  { name: "חשבונות ושירותים", kind: "expense", color: "warning" },
  { name: "מכולת", kind: "expense", color: "info" },
  { name: "תחבורה", kind: "expense", color: "positive" },
  { name: "אוכל בחוץ", kind: "expense", color: "violet" },
  { name: "בריאות", kind: "expense", color: "negative" },
  { name: "ביטוח", kind: "expense", color: "info" },
  { name: "חינוך וילדים", kind: "expense", color: "warning" },
  { name: "בילויים", kind: "expense", color: "violet" },
  { name: "קניות", kind: "expense", color: "primary" },
  { name: "מנויים", kind: "expense", color: "violet" },
  { name: "נסיעות", kind: "expense", color: "info" },
  { name: "מתנות ותרומות", kind: "expense", color: "positive" },
  { name: "עמלות", kind: "expense", color: "negative" },
  { name: "הוצאה אחרת", kind: "expense", color: "warning" },
];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function isoDaysAhead(days: number): string {
  return isoDaysAgo(-days);
}

async function seed() {
  const existing = await db.select().from(users).where(eq(users.email, DEV_EMAIL));
  if (existing.length > 0) {
    console.log("Seed already applied — skipping.");
    return;
  }

  const [user] = await db
    .insert(users)
    .values({ email: DEV_EMAIL, displayName: "בן" })
    .returning();
  const [household] = await db
    .insert(households)
    .values({ name: "משק הבית שלנו", baseCurrency: "ILS", timezone: "Asia/Jerusalem" })
    .returning();
  if (!user || !household) throw new Error("failed to seed user/household");

  await db.insert(householdMembers).values({
    householdId: household.householdId,
    userId: user.userId,
    role: "owner",
    status: "active",
    joinedAt: new Date(),
  });

  // Categories (seeded defaults, fully editable per docs)
  const categoryIdByName = new Map<string, string>();
  let sortOrder = 0;
  for (const cat of SEED_CATEGORIES) {
    const [parent] = await db
      .insert(categories)
      .values({
        householdId: household.householdId,
        name: cat.name,
        kind: cat.kind,
        color: cat.color,
        sortOrder: sortOrder++,
      })
      .returning();
    if (!parent) continue;
    categoryIdByName.set(cat.name, parent.categoryId);
    for (const childName of cat.children ?? []) {
      const [child] = await db
        .insert(categories)
        .values({
          householdId: household.householdId,
          name: childName,
          kind: cat.kind,
          color: cat.color,
          parentCategoryId: parent.categoryId,
          sortOrder: sortOrder++,
        })
        .returning();
      if (child) categoryIdByName.set(childName, child.categoryId);
    }
  }

  await db.insert(tags).values([
    { householdId: household.householdId, name: "שבועי" },
    { householdId: household.householdId, name: "חופשה" },
  ]);

  // Accounts
  const [checking] = await db
    .insert(accounts)
    .values({
      householdId: household.householdId,
      name: "עו״ש לאומי",
      type: "checking",
      institutionName: "לאומי",
      accountMask: "4821",
      openingBalance: "6000.00",
      currentBalance: "6000.00",
    })
    .returning();
  const [savings] = await db
    .insert(accounts)
    .values({
      householdId: household.householdId,
      name: "קרן חירום",
      type: "savings",
      institutionName: "לאומי",
      accountMask: "9012",
      openingBalance: "25000.00",
      currentBalance: "25000.00",
    })
    .returning();
  const [credit] = await db
    .insert(accounts)
    .values({
      householdId: household.householdId,
      name: "כרטיס אשראי",
      type: "credit",
      institutionName: "מקס",
      accountMask: "2290",
      openingBalance: "0.00",
      currentBalance: "0.00",
    })
    .returning();
  if (!checking || !savings || !credit) throw new Error("failed to seed accounts");

  const cat = (name: string): string => {
    const id = categoryIdByName.get(name);
    if (!id) throw new Error(`missing seeded category ${name}`);
    return id;
  };

  // Sample transactions (checking): salary in, groceries/utilities out, transfer to savings
  const base = {
    householdId: household.householdId,
    createdBy: user.userId,
    status: "cleared" as const,
  };
  await db.insert(transactions).values([
    {
      ...base,
      accountId: checking.accountId,
      type: "income",
      amount: "14200.00",
      transactionDate: isoDaysAgo(3),
      description: "משכורת — חברת נורת׳ווינד",
      categoryId: cat("משכורת"),
    },
    {
      ...base,
      accountId: checking.accountId,
      type: "expense",
      amount: "412.60",
      transactionDate: isoDaysAgo(1),
      description: "שופרסל",
      merchantName: "שופרסל",
      categoryId: cat("מכולת"),
    },
    {
      ...base,
      accountId: checking.accountId,
      type: "expense",
      amount: "289.40",
      transactionDate: isoDaysAgo(2),
      description: "חברת החשמל",
      merchantName: "חברת החשמל",
      categoryId: cat("חשבונות ושירותים"),
      status: "pending",
    },
    {
      ...base,
      accountId: credit.accountId,
      type: "expense",
      amount: "168.00",
      transactionDate: isoDaysAgo(4),
      description: "ארוחה בחוץ — מסעדת האחים",
      merchantName: "האחים",
      categoryId: cat("אוכל בחוץ"),
    },
  ]);

  // Transfer: checking -> savings (two legs + link)
  const [fromLeg] = await db
    .insert(transactions)
    .values({
      ...base,
      accountId: checking.accountId,
      type: "transfer",
      amount: "1500.00",
      transactionDate: isoDaysAgo(2),
      description: "העברה לקרן חירום",
    })
    .returning();
  const [toLeg] = await db
    .insert(transactions)
    .values({
      ...base,
      accountId: savings.accountId,
      type: "transfer",
      amount: "1500.00",
      transactionDate: isoDaysAgo(2),
      description: "העברה מעו״ש",
    })
    .returning();
  if (fromLeg && toLeg) {
    await db.insert(transferLinks).values({
      fromTransactionId: fromLeg.transactionId,
      toTransactionId: toLeg.transactionId,
    });
  }

  // Recompute balances to match the seeded ledger
  await db
    .update(accounts)
    .set({ currentBalance: "18098.00" }) // 6000 + 14200 - 412.60 - 289.40 - 1500
    .where(eq(accounts.accountId, checking.accountId));
  await db
    .update(accounts)
    .set({ currentBalance: "26500.00" }) // 25000 + 1500
    .where(eq(accounts.accountId, savings.accountId));
  await db
    .update(accounts)
    .set({ currentBalance: "-168.00" })
    .where(eq(accounts.accountId, credit.accountId));

  // Active annual budget period for the current year
  const year = new Date().getFullYear();
  const [period] = await db
    .insert(budgetPeriods)
    .values({ householdId: household.householdId, year, status: "active" })
    .returning();
  if (period) {
    await db.insert(budgetLines).values([
      { budgetPeriodId: period.budgetPeriodId, categoryId: cat("מכולת"), plannedAmount: "30000.00" },
      { budgetPeriodId: period.budgetPeriodId, categoryId: cat("חשבונות ושירותים"), plannedAmount: "13200.00" },
      { budgetPeriodId: period.budgetPeriodId, categoryId: cat("אוכל בחוץ"), plannedAmount: "12000.00" },
      { budgetPeriodId: period.budgetPeriodId, categoryId: cat("תחבורה"), plannedAmount: "9600.00" },
      { budgetPeriodId: period.budgetPeriodId, categoryId: cat("דיור"), plannedAmount: "66000.00" },
    ]);
  }

  // Recurring: rent + streaming, with upcoming occurrences for the dashboard
  const [rent] = await db
    .insert(recurringTemplates)
    .values({
      householdId: household.householdId,
      name: "שכר דירה",
      flowType: "expense",
      amountExpected: "5500.00",
      frequency: "monthly",
      startDate: isoDaysAgo(90),
      dayOfMonth: 1,
      accountId: checking.accountId,
      categoryId: cat("שכירות / משכנתא"),
    })
    .returning();
  const [streaming] = await db
    .insert(recurringTemplates)
    .values({
      householdId: household.householdId,
      name: "נטפליקס",
      flowType: "expense",
      amountExpected: "54.90",
      frequency: "monthly",
      startDate: isoDaysAgo(90),
      dayOfMonth: 10,
      accountId: credit.accountId,
      categoryId: cat("מנויים"),
    })
    .returning();
  if (rent) {
    await db.insert(recurringOccurrences).values({
      recurringId: rent.recurringId,
      dueDate: isoDaysAhead(3),
      expectedAmount: "5500.00",
    });
  }
  if (streaming) {
    await db.insert(recurringOccurrences).values({
      recurringId: streaming.recurringId,
      dueDate: isoDaysAhead(1),
      expectedAmount: "54.90",
    });
  }

  console.log("Seed complete.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
