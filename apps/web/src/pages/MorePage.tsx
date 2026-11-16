import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, LogOut, Repeat, Upload, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { logoutResponseSchema } from "@financial-management/shared";
import { apiFetch } from "@/api/client";
import { useSession } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { Icon } from "@/components/ui/icon";
import { ListCard, ListRow } from "@/components/ui/list-card";

const items = [
  { to: "/import", label: "ייבוא והתאמות", description: "קובץ CSV והתאמת דפי חשבון", icon: Upload },
  { to: "/recurring", label: "הוראות קבע", description: "תבניות ומועדים קרובים", icon: Repeat },
  { to: "/household", label: "משק בית", description: "חברים, קטגוריות והגדרות", icon: Users },
];

export function MorePage() {
  const queryClient = useQueryClient();
  const session = useSession();
  const logout = useMutation({
    mutationFn: () => apiFetch("/api/auth/logout", logoutResponseSchema, { method: "POST" }),
    onSuccess: () => {
      queryClient.clear();
      window.location.assign("/"); // full reload re-runs the auth gate with a clean cache
    },
  });

  return (
    <>
      <PageHeader title="עוד" />
      <ListCard>
        {items.map((item) => (
          <ListRow key={item.to} as={Link} to={item.to}>
            <span className="flex size-9 items-center justify-center rounded-[10px] bg-primary-soft text-primary-strong">
              <Icon icon={item.icon} className="size-[18px]" strokeWidth={1.8} />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-bold">{item.label}</span>
              <span className="block text-xs font-medium text-muted-foreground">
                {item.description}
              </span>
            </span>
            <Icon icon={ChevronLeft} className="size-4 text-muted-foreground" strokeWidth={2} />
          </ListRow>
        ))}
      </ListCard>
      <div className="mt-6 flex items-center justify-between gap-3 px-1">
        <span className="truncate text-xs font-medium text-muted-foreground" dir="ltr">
          {session.data?.user.email}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          <Icon icon={LogOut} className="size-4" strokeWidth={1.8} />
          התנתקות
        </Button>
      </div>
    </>
  );
}
