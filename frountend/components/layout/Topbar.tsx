"use client";

import { Bell, Search } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";

interface TopbarProps {
  search: string;
  onSearch: (value: string) => void;
  onNotifications: () => void;
  showSearch?: boolean;
}

export function Topbar({ search, onSearch, onNotifications, showSearch = true }: TopbarProps) {
  const { settings } = useSettings();
  return (
    <header className="topbar">
      {showSearch ? <label className="search-box">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search plants</span>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search plants..."
          />
          {search && <span className="search-count" aria-live="polite">Filtering plants</span>}
        </label> : <span />}
      <div className="topbar-user">
        <button className="icon-button notification-button" onClick={onNotifications} aria-label="Open notifications">
          <Bell size={19} />
        </button>
        <div className="avatar" aria-hidden="true">{settings.displayName.charAt(0).toUpperCase()}</div>
        <div className="user-copy"><strong>{settings.displayName}</strong><span>Plant Enthusiast</span></div>
      </div>
    </header>
  );
}
