"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  NOTIFICATIONS_EVENT,
  clearNotifications,
  defaultPrefs,
  markAllNotificationsRead,
  markNotificationRead,
  readNotificationState,
  removeNotification,
  setNotificationKindEnabled,
  unreadCount,
} from "@/lib/notifications/store";
import type { NotificationKind, NotificationState } from "@/lib/notifications/types";

export function useNotifications() {
  const [state, setState] = useState<NotificationState>({ items: [], prefs: defaultPrefs() });

  const refresh = useCallback(() => {
    setState(readNotificationState());
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(NOTIFICATIONS_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(NOTIFICATIONS_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [refresh]);

  return useMemo(
    () => ({
      items: state.items,
      prefs: state.prefs,
      unread: unreadCount(state.items),
      markRead: (id: string) => markNotificationRead(id, true),
      markUnread: (id: string) => markNotificationRead(id, false),
      markAllRead: markAllNotificationsRead,
      remove: removeNotification,
      clearAll: clearNotifications,
      setKindEnabled: (kind: NotificationKind, enabled: boolean) => setNotificationKindEnabled(kind, enabled),
    }),
    [state],
  );
}
