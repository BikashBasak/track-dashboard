"use client";

import { NotificationBell } from "@/components/notification-bell";
import { CreateCategoryControl } from "@/components/create-category-control";
import { useNotifications } from "@/lib/notifications/use-notifications";
import { PRODUCT_MODULES } from "@/lib/modules";
import { cn } from "@/lib/utils";
import { Building2, Inbox, Radar, Search, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { StorefrontPicker, StorefrontProvider } from "./storefront";
import { SettingsProvider, useSettings } from "./settings-context";
import { AutoSyncRunner } from "./auto-sync-runner";
import { WatchlistProvider } from "./watchlist-context";

const nav = [
  { href: "/apps", label: "App Tracking", icon: Search },
  { href: "/accounts", label: "Account Tracking", icon: Building2 },
  { href: "/notifications", label: "Notifications", icon: Inbox },
  { href: "/settings", label: "Settings", icon: Settings },
];

function AutoSyncBadge() {
  const { ready, settings } = useSettings();
  if (!ready || !settings.autoSyncEnabled) return null;
  return (
    <Link
      href="/settings"
      className="rounded-full bg-mint/15 px-2.5 py-1 text-[11px] font-semibold text-mint hover:bg-mint/25"
    >
      Auto sync on
    </Link>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { unread } = useNotifications();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
      <div className="min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
        <aside className="border-b border-white/10 bg-[#08141d]/90 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-3 px-5 py-5">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-mint/15 text-mint">
              <Radar className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-wide">Track Dashboard</p>
              <p className="text-xs text-mist">Play Store intelligence</p>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
            {nav.map((item) => {
              const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
              const product = PRODUCT_MODULES.find((m) => m.href === item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-2 text-sm whitespace-nowrap",
                    active ? "bg-mint/12 text-mint" : "text-mist hover:bg-white/5 hover:text-foam",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                  {mounted && item.href === "/notifications" && unread > 0 ? (
                    <span className="ml-auto rounded-full bg-mint px-1.5 py-0.5 text-[10px] font-bold text-ink">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  ) : product?.status === "next" || product?.status === "planned" ? (
                    <span className="ml-auto hidden rounded-full bg-white/8 px-2 py-0.5 text-[10px] uppercase tracking-wide text-mist lg:inline">
                      soon
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </aside>
        <div className="min-w-0">
          <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#071018]/80 px-4 py-3 backdrop-blur-xl sm:px-6">
            <p className="text-sm text-mist">
              App Tracking, Account Tracking, Notifications, and Settings.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <CreateCategoryControl />
              <AutoSyncBadge />
              <NotificationBell />
              <StorefrontPicker />
            </div>
          </header>
          <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <StorefrontProvider>
      <WatchlistProvider>
        <SettingsProvider>
          <AutoSyncRunner />
          <ShellInner>{children}</ShellInner>
        </SettingsProvider>
      </WatchlistProvider>
    </StorefrontProvider>
  );
}
