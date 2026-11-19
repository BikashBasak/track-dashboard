"use client";

import { NotificationRow } from "@/components/notification-item";
import { useNotifications } from "@/lib/notifications/use-notifications";
import { Bell, Inbox } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function NotificationBell() {
  const { items, unread, markRead, markAllRead, remove } = useNotifications();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const root = useRef<HTMLDivElement>(null);
  const recent = items.slice(0, 8);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onClick(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-foam hover:border-mint/40 hover:text-mint"
        aria-label={mounted && unread ? `${unread} unread notifications` : "Notifications"}
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" />
        {mounted && unread > 0 ? (
          <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-mint px-1 text-[10px] font-bold text-ink">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+10px)] z-30 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#0b1620] shadow-2xl shadow-black/40">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 ? (
              <button type="button" onClick={markAllRead} className="text-xs text-mint hover:underline">
                Mark all read
              </button>
            ) : (
              <span className="text-xs text-mist">Caught up</span>
            )}
          </div>
          <div className="max-h-[min(70vh,420px)] overflow-y-auto soft-scroll p-2">
            {recent.length === 0 ? (
              <div className="px-3 py-10 text-center text-sm text-mist">
                No alerts yet. Track apps or accounts, then use Check now on the notifications page.
              </div>
            ) : (
              recent.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  compact
                  onOpen={(row) => {
                    markRead(row.id);
                    setOpen(false);
                  }}
                  onRemove={remove}
                />
              ))
            )}
          </div>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-2 border-t border-white/10 px-4 py-3 text-sm text-mint hover:bg-white/4"
          >
            <Inbox className="h-4 w-4" />
            See all notifications
          </Link>
        </div>
      ) : null}
    </div>
  );
}
