"use client";

import { createContext, startTransition, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, type Theme, type UserSettings } from "@/lib/settings";

interface SettingsContextValue {
  settings: UserSettings;
  updateDisplayName: (displayName: string) => void;
  updateTheme: (theme: Theme) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function readSavedSettings(): UserSettings {
  try {
    const saved = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!saved) return DEFAULT_SETTINGS;
    const parsed: unknown = JSON.parse(saved);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_SETTINGS;

    const candidate = parsed as Partial<UserSettings>;
    return {
      displayName: typeof candidate.displayName === "string" && candidate.displayName.trim().length > 0 && candidate.displayName.length <= 50
        ? candidate.displayName
        : DEFAULT_SETTINGS.displayName,
      theme: candidate.theme === "dark" || candidate.theme === "light" ? candidate.theme : DEFAULT_SETTINGS.theme,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    startTransition(() => setSettings(readSavedSettings()));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  function persist(next: UserSettings) {
    setSettings(next);
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }

  const value = useMemo<SettingsContextValue>(() => ({
    settings,
    updateDisplayName: (displayName) => persist({ ...settings, displayName }),
    updateTheme: (theme) => persist({ ...settings, theme }),
    resetSettings: () => persist(DEFAULT_SETTINGS),
  }), [settings]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used within SettingsProvider");
  return context;
}