"use client";

import {
  BellRing,
  BrainCircuit,
  CalendarDays,
  ChartNoAxesCombined,
  FileText,
  House,
  Leaf,
  Settings,
  Sprout,
  Waves,
} from "lucide-react";

const navigation = [
  { label: "Dashboard", icon: House },
  { label: "My Plants", icon: Sprout },
  { label: "Sensor Data", icon: Waves },
  { label: "Watering Schedule", icon: CalendarDays },
  { label: "AI Predictions", icon: BrainCircuit },
  { label: "Growth Monitoring", icon: ChartNoAxesCombined },
  { label: "Reports", icon: FileText },
  { label: "Settings", icon: Settings },
];

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
}

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar">
      <button className="brand" onClick={() => onNavigate("Dashboard")} aria-label="waterX dashboard">
        <span className="brand-mark"><Leaf size={23} fill="currentColor" /></span>
        <span className="brand-name">waterX</span>
        <span className="brand-subtitle">Smart Plant Water<br />Management System</span>
      </button>
      <nav className="side-nav" aria-label="Main navigation">
        {navigation.map(({ label, icon: Icon }) => (
          <button
            key={label}
            className={`nav-link ${activePage === label ? "active" : ""}`}
            onClick={() => onNavigate(label)}
            aria-label={label}
            aria-current={activePage === label ? "page" : undefined}
          >
            <Icon size={17} strokeWidth={1.8} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="online-line"><span className="online-dot" />System Online</div>
        <p>Apr 27, 2025 · 10:24 AM</p>
        <span className="demo-label"><BellRing size={12} /> Demonstration mode</span>
      </div>
    </aside>
  );
}
