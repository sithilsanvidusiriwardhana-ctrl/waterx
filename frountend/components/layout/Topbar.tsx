"use client";

import { Bell, Search } from "lucide-react";
import { notifications } from "@/lib/mock-data";

interface TopbarProps {
  search: string;
  onSearch: (value: string) => void;
  onNotifications: () => void;
}

export function Topbar({ search, onSearch, onNotifications }: TopbarProps) {
  return (
    <header className="topbar">
      <label className="search-box">
        <Search size={16} aria-hidden="true" />
        <span className="sr-only">Search plants</span>
        <input
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search plants..."
        />
        {search && <span className="search-count" aria-live="polite">Filtering plants</span>}
      </label>
      <div className="topbar-user">
        <button className="icon-button notification-button" onClick={onNotifications} aria-label="Open notifications">
          <Bell size={19} />
          <span className="notification-count">{notifications.length}</span>
        </button>
        <div className="avatar" aria-hidden="true">S</div>
        <div className="user-copy"><strong>Student</strong><span>Plant Enthusiast</span></div>
      </div>
    </header>
  );
}
