"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  emptyFullSyncMeta,
  readFullSyncMeta,
  writeFullSyncMeta,
  type FullSyncMeta,
} from "@/lib/sync/full-sync-meta";
import {
  emptySyncState,
  readSettings,
  readSyncState,
  writeSettings,
  writeSyncState,
  type AppSettings,
  type AutoSyncState,
} from "@/lib/sync/state";

type SettingsApi = {
  ready: boolean;
  settings: AppSettings;
  sync: AutoSyncState;
  fullSync: FullSyncMeta;
  setAutoSyncEnabled: (enabled: boolean) => void;
  replaceSync: (next: AutoSyncState) => void;
  replaceFullSync: (next: FullSyncMeta) => void;
  resetBaseline: () => void;
};

const Ctx = createContext<SettingsApi | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({ autoSyncEnabled: false });
  const [sync, setSync] = useState<AutoSyncState>(emptySyncState);
  const [fullSync, setFullSync] = useState<FullSyncMeta>(emptyFullSyncMeta);

  useEffect(() => {
    setSettings(readSettings());
    setSync(readSyncState());
    setFullSync(readFullSyncMeta());
    setReady(true);
  }, []);

  const setAutoSyncEnabled = useCallback((enabled: boolean) => {
    setSettings((prev) => {
      const next = { ...prev, autoSyncEnabled: enabled };
      writeSettings(next);
      return next;
    });
  }, []);

  const replaceSync = useCallback((next: AutoSyncState) => {
    writeSyncState(next);
    setSync(next);
  }, []);

  const replaceFullSync = useCallback((next: FullSyncMeta) => {
    writeFullSyncMeta(next);
    setFullSync(next);
  }, []);

  const resetBaseline = useCallback(() => {
    const next: FullSyncMeta = {
      baselineReady: false,
      lastFullSyncAt: null,
      lastFullSyncMode: null,
      lastMessage: "Baseline cleared. Run Sync all to save a fresh store.",
    };
    writeFullSyncMeta(next);
    setFullSync(next);
  }, []);

  const value = useMemo<SettingsApi>(
    () => ({
      ready,
      settings,
      sync,
      fullSync,
      setAutoSyncEnabled,
      replaceSync,
      replaceFullSync,
      resetBaseline,
    }),
    [ready, settings, sync, fullSync, setAutoSyncEnabled, replaceSync, replaceFullSync, resetBaseline],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("SettingsProvider missing");
  return ctx;
}
