"use client";

import type { ReactNode } from "react";
import { PlantsProvider } from "@/context/PlantsContext";
import { SettingsProvider } from "@/context/SettingsContext";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <PlantsProvider>{children}</PlantsProvider>
    </SettingsProvider>
  );
}
