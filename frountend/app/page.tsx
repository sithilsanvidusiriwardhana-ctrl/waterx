"use client";

import { useState } from "react";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { SettingsProvider } from "@/context/SettingsContext";

export default function Home() {
  const [activePage, setActivePage] = useState("Dashboard");
  return <SettingsProvider><Dashboard activePage={activePage} onNavigate={setActivePage} /></SettingsProvider>;
}
