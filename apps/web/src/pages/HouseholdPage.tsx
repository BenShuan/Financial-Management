import { useSearchParams } from "react-router-dom";
import { useSession } from "@/api/hooks";
import { PageHeader } from "@/components/layout/PageHeader";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { CategoriesTab } from "@/pages/household/CategoriesTab";
import { MembersTab } from "@/pages/household/MembersTab";
import { TagsTab } from "@/pages/household/TagsTab";

const TABS = [
  { value: "members", label: "חברים" },
  { value: "categories", label: "קטגוריות" },
  { value: "tags", label: "תגיות" },
] as const;
type TabValue = (typeof TABS)[number]["value"];

export function HouseholdPage() {
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const tab: TabValue = TABS.some((t) => t.value === requested) ? (requested as TabValue) : "members";

  return (
    <>
      <PageHeader title="משק בית" subtitle={session.data?.household.name} />
      <SegmentedControl
        aria-label="אזורי משק הבית"
        className="mb-5"
        options={TABS}
        value={tab}
        onChange={(value) => setParams(value === "members" ? {} : { tab: value }, { replace: true })}
      />
      {tab === "members" ? <MembersTab /> : tab === "categories" ? <CategoriesTab /> : <TagsTab />}
    </>
  );
}
