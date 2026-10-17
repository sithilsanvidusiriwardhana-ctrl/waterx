"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Info, X } from "lucide-react";
import { ModalFrame } from "@/components/shared/ModalFrame";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { getDashboard, type DashboardAlert } from "@/lib/api";

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
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [alertError, setAlertError] = useState("");
  const [alertsLoading, setAlertsLoading] = useState(false);
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

  async function openNotifications() {
    if (onNotifications) {
      onNotifications();
      return;
    }
    setShowNotifications(true);
    setAlertsLoading(true);
    setAlertError("");
    try {
      setAlerts((await getDashboard()).alerts);
    } catch (error) {
      setAlertError(error instanceof Error ? error.message : "Alerts could not be loaded.");
    } finally {
      setAlertsLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <Sidebar activePage={activePage} onNavigate={navigate} />
      <main className="main-column">
        <Topbar
          search={search ?? internalSearch}
          onSearch={onSearch ?? setInternalSearch}
          onNotifications={() => { void openNotifications(); }}
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
            <div><span className="eyebrow">WATERX DATABASE</span><h2 id="notifications-title">Backend alerts</h2></div>
            <button className="icon-button" onClick={() => setShowNotifications(false)} aria-label="Close dialog"><X size={19} /></button>
          </div>
          <div className="dialog-list">
            {alertsLoading ? <p className="dialog-content" role="status">Loading saved alerts…</p>
              : alertError ? <p className="settings-error" role="alert">{alertError}</p>
                : alerts.length ? alerts.map((alert) => (
                  <article className="notification-row" key={alert.id}>
                    <span className={`notice-icon ${alert.severity === "critical" ? "danger" : alert.severity}`}><Info size={14} /></span>
                    <div className="notification-copy">
                      <div className="row-title"><strong>{alert.type.replaceAll("_", " ")}</strong><time>{new Date(alert.time).toLocaleString()}</time></div>
                      <p>{alert.message}</p>
                    </div>
                  </article>
                )) : <p className="dialog-content">No unresolved alerts are stored in the database.</p>}
          </div>
          <div className="modal-actions"><button className="button primary" onClick={() => setShowNotifications(false)}>Done</button></div>
        </ModalFrame>
      )}
    </div>
  );
}
