import { db } from "../db/index.js";
import { categories } from "../db/schema.js";

// Category colors are design-token names; the web app maps them to classes.
type SeedCategory = {
  name: string;
  kind: "income" | "expense";
  color: string;
  code: string;
  children?: { name: string; code: string }[];
};

// Codes double as the keyboard shortcut used on the transactions page: a
// Hebrew letter per income category, a sequential number per expense category.
const SEED_CATEGORIES: SeedCategory[] = [
  { name: "משכורת", kind: "income", color: "positive", code: "מ" },
  { name: "בונוס", kind: "income", color: "positive", code: "ב" },
  { name: "הכנסות מהשקעות", kind: "income", color: "info", code: "ה" },
  { name: "הכנסה אחרת", kind: "income", color: "positive", code: "כ" },
  {
    name: "דיור",
    kind: "expense",
    color: "primary",
    code: "1",
    children: [
      { name: "שכירות / משכנתא", code: "2" },
      { name: "תחזוקת בית", code: "3" },
    ],
  },
  { name: "חשבונות ושירותים", kind: "expense", color: "warning", code: "4" },
  { name: "מכולת", kind: "expense", color: "info", code: "5" },
  { name: "תחבורה", kind: "expense", color: "positive", code: "6" },
  { name: "אוכל בחוץ", kind: "expense", color: "violet", code: "7" },
  { name: "בריאות", kind: "expense", color: "negative", code: "8" },
  { name: "ביטוח", kind: "expense", color: "info", code: "9" },
  { name: "חינוך וילדים", kind: "expense", color: "warning", code: "10" },
  { name: "בילויים", kind: "expense", color: "violet", code: "11" },
  { name: "קניות", kind: "expense", color: "primary", code: "12" },
  { name: "מנויים", kind: "expense", color: "violet", code: "13" },
  { name: "נסיעות", kind: "expense", color: "info", code: "14" },
  { name: "מתנות ותרומות", kind: "expense", color: "positive", code: "15" },
  { name: "עמלות", kind: "expense", color: "negative", code: "16" },
  { name: "הוצאה אחרת", kind: "expense", color: "warning", code: "17" },
];

/** Seeds the default Hebrew categories for a new household (docs/agent/03). Returns id by name. */
export async function insertDefaultCategories(householdId: string): Promise<Map<string, string>> {
  const categoryIdByName = new Map<string, string>();
  let sortOrder = 0;
  for (const cat of SEED_CATEGORIES) {
    const [parent] = await db
      .insert(categories)
      .values({
        householdId,
        name: cat.name,
        kind: cat.kind,
        color: cat.color,
        code: cat.code,
        sortOrder: sortOrder++,
      })
      .returning();
    if (!parent) continue;
    categoryIdByName.set(cat.name, parent.categoryId);
    for (const child of cat.children ?? []) {
      const [row] = await db
        .insert(categories)
        .values({
          householdId,
          name: child.name,
          kind: cat.kind,
          color: cat.color,
          code: child.code,
          parentCategoryId: parent.categoryId,
          sortOrder: sortOrder++,
        })
        .returning();
      if (row) categoryIdByName.set(child.name, row.categoryId);
    }
  }
  return categoryIdByName;
}
