import { House } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "inline-flex items-center gap-2 rounded-control px-3 py-2 font-display text-sm font-medium transition-[background-color,color,box-shadow,transform] duration-300 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    isActive
      ? "bg-primary text-primary-foreground shadow-card"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );

export function AppLayout() {
  return (
    <div className="bg-architectural-grid flex min-h-dvh flex-col">
      <header className="glass-panel">
        <div className="mx-auto flex max-w-2xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-display text-lg font-medium tracking-tight">
            ניהול פיננסי
          </p>
          <nav
            className="flex flex-wrap gap-1"
            aria-label="ניווט ראשי"
          >
            <NavLink to="/" className={navClass} end>
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "inline-flex size-7 items-center justify-center rounded-full transition-colors duration-300 ease-in-out",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon icon={House} aria-hidden />
                  </span>
                  בית
                </>
              )}
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
