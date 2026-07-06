import {
  ArrowLeftRight,
  Ellipsis,
  House,
  Plus,
  Repeat,
  Target,
  Upload,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const tabItems: NavItem[] = [
  { to: "/", label: "בית", icon: House },
  { to: "/accounts", label: "חשבונות", icon: Wallet },
  { to: "/transactions", label: "תנועות", icon: ArrowLeftRight },
  { to: "/budgets", label: "תקציבים", icon: Target },
  { to: "/more", label: "עוד", icon: Ellipsis },
];

const sidebarItems: NavItem[] = [
  { to: "/", label: "בית", icon: House },
  { to: "/accounts", label: "חשבונות", icon: Wallet },
  { to: "/transactions", label: "תנועות", icon: ArrowLeftRight },
  { to: "/budgets", label: "תקציבים", icon: Target },
  { to: "/import", label: "ייבוא", icon: Upload },
  { to: "/recurring", label: "הוראות קבע", icon: Repeat },
  { to: "/household", label: "משק בית", icon: Users },
];

function MobileTabBar() {
  return (
    <nav
      aria-label="ניווט ראשי"
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-border bg-card px-2 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 lg:hidden"
    >
      {tabItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) =>
            cn(
              "flex min-w-14 flex-col items-center gap-1 rounded-control py-1 transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon icon={item.icon} className="size-[22px]" strokeWidth={isActive ? 2 : 1.8} />
              <span className={cn("text-[11px]", isActive ? "font-bold" : "font-semibold")}>
                {item.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function DesktopSidebar() {
  return (
    <aside className="fixed inset-y-0 start-0 z-40 hidden w-60 flex-col border-e border-border bg-card p-4 lg:flex">
      <div className="mb-3 flex items-center gap-2.5 border-b border-border px-2 pb-4">
        <span className="flex size-8 items-center justify-center rounded-[10px] bg-primary">
          <Icon icon={House} className="size-4 text-primary-foreground" strokeWidth={2.2} />
        </span>
        <span className="text-sm font-bold">משק הבית שלנו</span>
      </div>
      <nav aria-label="ניווט ראשי" className="flex flex-col gap-0.5">
        {sidebarItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-control px-3 py-2.5 text-sm transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-primary-soft font-bold text-primary-strong"
                  : "font-semibold text-secondary-foreground hover:bg-muted",
              )
            }
          >
            <Icon icon={item.icon} className="size-[18px]" strokeWidth={1.8} />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <NavLink
        to="/transactions/new"
        className="mt-auto flex items-center justify-center gap-2 rounded-control bg-primary px-3 py-3 text-sm font-bold text-primary-foreground transition-colors duration-300 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Icon icon={Plus} className="size-4" strokeWidth={2.4} />
        תנועה חדשה
      </NavLink>
    </aside>
  );
}

function QuickAddFab() {
  const location = useLocation();
  if (location.pathname === "/transactions/new") return null;
  return (
    <NavLink
      to="/transactions/new"
      aria-label="תנועה חדשה"
      className="fixed bottom-24 end-5 z-40 flex size-14 items-center justify-center rounded-[18px] bg-negative text-white shadow-[0_12px_24px] shadow-negative/40 transition-transform duration-300 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:hidden"
    >
      <Icon icon={Plus} className="size-6" strokeWidth={2.4} />
    </NavLink>
  );
}

export function AppLayout() {
  return (
    <div className="min-h-dvh bg-background">
      <DesktopSidebar />
      <div className="lg:ps-60">
        <main className="mx-auto w-full max-w-2xl px-5 pb-28 pt-6 lg:max-w-4xl lg:px-10 lg:pb-10 lg:pt-10">
          <Outlet />
        </main>
      </div>
      <QuickAddFab />
      <MobileTabBar />
    </div>
  );
}
