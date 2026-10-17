"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Info, X } from "lucide-react";
import { ModalFrame } from "@/components/shared/ModalFrame";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { notifications } from "@/lib/mock-data";

interface AppShellProps {
  children: ReactNode;
  search?: string;
  onSearch?: (value: string) => void;
  showSearch?: boolean;
  onNotifications?: () => void;
}

export function AppShell({ children, search, onSearch, showSearch = true, onNotifications }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [auxiliaryPage, setAuxiliaryPage] = useState("");
  const [internalSearch, setInternalSearch] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const activeRoute = pathname === "/settings" ? "Settings" : pathname.startsWith("/plants") ? "My Plants" : "Dashboard";
  const activePage = auxiliaryPage || activeRoute;

  function navigate(page: string) {
    setAuxiliaryPage("");
    if (page === "Dashboard") router.push("/");
    else if (page === "My Plants") router.push("/plants");
    else if (page === "Settings") router.push("/settings");
    else setAuxiliaryPage(page);
  }

  const pageIsAuxiliary = Boolean(auxiliaryPage);

  return (
    <div className="app-shell">
      <Sidebar activePage={activePage} onNavigate={navigate} />
      <main className="main-column">
        <Topbar
          search={search ?? internalSearch}
          onSearch={onSearch ?? setInternalSearch}
          onNotifications={() => onNotifications ? onNotifications() : setShowNotifications(true)}
          showSearch={showSearch}
        />
        {pageIsAuxiliary ? (
          <div className="placeholder-page">
            <span className="placeholder-icon"><Info size={25} /></span>
            <p className="eyebrow">WATERX WORKSPACE</p>
            <h1>{auxiliaryPage}</h1>
            <p>This section is not implemented in the frontend demo yet.</p>
            <button className="button primary" onClick={() => navigate("Dashboard")}>Back to Dashboard</button>
          </div>
        ) : children}
      </main>
      {showNotifications && (
        <ModalFrame labelledBy="notifications-title" onClose={() => setShowNotifications(false)}>
          <div className="modal-heading">
            <div><span className="eyebrow">WATERX DEMO</span><h2 id="notifications-title">All notifications</h2></div>
            <button className="icon-button" onClick={() => setShowNotifications(false)} aria-label="Close dialog"><X size={19} /></button>
          </div>
          <div className="dialog-list">
            {notifications.map((notification) => (
              <article className="notification-row" key={notification.id}>
                <span className={`notice-icon ${notification.tone}`}><Info size={14} /></span>
                <div className="notification-copy">
                  <div className="row-title"><strong>{notification.title}</strong><time>{notification.time}</time></div>
                  <p>{notification.description}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="modal-actions"><button className="button primary" onClick={() => setShowNotifications(false)}>Done</button></div>
        </ModalFrame>
      )}
    </div>
  );
}
