"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  ArrowDownRight,
  ArrowRight,
  BrainCircuit,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Droplet,
  Droplets,
  Flower2,
  Gauge,
  Info,
  Leaf,
  Plus,
  Sprout,
  Thermometer,
  X,
} from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { AddPlantModal } from "@/components/plants/AddPlantModal";
import { AIPredictionChart, SoilMoistureChart, WaterTankChart } from "@/components/dashboard/Charts";
import { ModalFrame } from "@/components/shared/ModalFrame";
import { dashboardMetrics, notifications, plants as initialPlants, wateringEvents } from "@/lib/mock-data";
import type { NotificationItem, Plant } from "@/lib/types";

type DialogState = "add-plant" | "notifications" | "watering-events" | "reports" | "schedule" | "recommendation" | null;
type ContentDialogState = Exclude<DialogState, "add-plant" | null>;

function SummaryCards({ plants }: { plants: Plant[] }) {
  const healthyCount = plants.filter((plant) => plant.status === "Healthy").length;
  return (
    <section className="summary-grid" aria-label="Dashboard summary">
      <article className="summary-card">
        <span className="summary-icon green"><Sprout size={20} /></span>
        <div className="summary-content"><span className="summary-label">Total Plants</span><strong>{plants.length}</strong><small><b>{healthyCount} Healthy</b><i /> <em>{plants.filter((plant) => plant.status === "Needs Water").length} Needs Attention</em></small></div>
      </article>
      <article className="summary-card">
        <span className="summary-icon blue"><Droplet size={21} fill="currentColor" /></span>
        <div className="summary-content"><span className="summary-label">Water Tank Level</span><strong>{dashboardMetrics.tankLevelPercent}%</strong><div className="mini-progress"><i style={{ width: `${dashboardMetrics.tankLevelPercent}%` }} /></div><small className="muted">~ {((dashboardMetrics.tankCapacityLiters - dashboardMetrics.tankUsedLiters)).toFixed(1)} L remaining</small></div>
      </article>
      <article className="summary-card">
        <span className="summary-icon mint"><Droplets size={20} /></span>
        <div className="summary-content"><span className="summary-label">Total Water Used</span><strong>{dashboardMetrics.weeklyWaterUsedLiters} L</strong><small className="muted">This week <em className="positive"><ArrowDownRight size={12} /> +{dashboardMetrics.weeklyWaterChangePercent}%</em></small></div>
      </article>
      <article className="summary-card">
        <span className="summary-icon purple"><BrainCircuit size={20} /></span>
        <div className="summary-content"><span className="summary-label">AI Prediction Accuracy</span><strong>{dashboardMetrics.predictionAccuracyPercent}%</strong><small className="muted">MAE: {dashboardMetrics.meanAbsoluteError}</small></div>
      </article>
    </section>
  );
}

function PlantCard({ plant }: { plant: Plant }) {
  return (
    <article className="plant-card">
      <div className="plant-heading">
        <Image className="plant-image" src={plant.image} alt={`${plant.name} plant`} width={60} height={64} unoptimized />
        <div className="plant-ident"><h3>{plant.name}</h3><span>{plant.category}</span><span className={`status-badge ${plant.status.toLowerCase().replace(" ", "-")}`}><i />{plant.status}</span></div>
      </div>
      <div className="plant-metrics">
        <div><Droplet className="metric-blue" size={14} /><span>Soil Moisture</span><strong>{plant.moisture}%</strong></div>
        <div><Thermometer className="metric-red" size={14} /><span>Temperature</span><strong>{plant.temperature}°C</strong></div>
        <div><Gauge className="metric-blue" size={14} /><span>Tank Level</span><strong>{plant.tankLevel}%</strong></div>
      </div>
      <div className="next-watering"><CalendarDays size={14} /><div><span>Next watering</span><strong>{plant.nextWatering}</strong></div></div>
    </article>
  );
}

function PlantStatus({ plants }: { plants: Plant[] }) {
  return (
    <section className="panel plant-section">
      <div className="section-heading"><div><h2>Plant Status</h2><p>Current conditions for your plants</p></div><span className="section-count">{plants.length} plants</span></div>
      {plants.length > 0 ? <div className="plant-grid">{plants.map((plant) => <PlantCard key={plant.id} plant={plant} />)}</div> : <div className="empty-state"><Sprout size={24} /><strong>No plants found</strong><span>Try another search or add a plant to your dashboard.</span></div>}
    </section>
  );
}

function NotificationsPanel({ onViewAll }: { onViewAll: () => void }) {
  const iconByTone = {
    warning: CircleAlert,
    success: CheckCircle2,
    info: Info,
    danger: Droplet,
  };
  return (
    <section className="panel side-panel">
      <div className="panel-heading compact"><div className="title-icon"><BellIcon /><h2>Alerts &amp; Notifications</h2></div><button className="text-link" onClick={onViewAll}>View All <ArrowRight size={12} /></button></div>
      <div className="notification-list">
        {notifications.map((notification) => {
          const Icon = iconByTone[notification.tone];
          return <NotificationRow key={notification.id} item={notification} icon={<Icon size={14} />} />;
        })}
      </div>
    </section>
  );
}

function BellIcon() {
  return <CircleAlert size={17} className="heading-blue" />;
}

function NotificationRow({ item, icon }: { item: NotificationItem; icon: React.ReactNode }) {
  return <article className="notification-row"><span className={`notice-icon ${item.tone}`}>{icon}</span><div className="notification-copy"><div className="row-title"><strong>{item.title}</strong><time>{item.time}</time></div><p>{item.description}</p></div></article>;
}

function RecentEvents({ onViewAll }: { onViewAll: () => void }) {
  return (
    <section className="panel side-panel events-panel">
      <div className="panel-heading compact"><div><h2>Recent Watering Events</h2></div><button className="text-link" onClick={onViewAll}>View All <ArrowRight size={12} /></button></div>
      <div className="event-list">{wateringEvents.map((event) => <article className="event-row" key={event.id}><span className={`event-icon ${event.result.toLowerCase()}`}>{event.result === "Watered" ? <Check size={14} /> : <X size={14} />}</span><div className="event-copy"><div className="row-title"><strong>{event.plant}</strong><time>{event.time}</time></div><p>{event.detail}</p></div></article>)}</div>
    </section>
  );
}

function QuickActions({ onAction }: { onAction: (action: Exclude<DialogState, null>) => void }) {
  return <section className="panel quick-actions"><h2>Quick Actions</h2><button className="button primary" onClick={() => onAction("add-plant")}><Plus size={15} />Add New Plant</button><button className="button secondary" onClick={() => onAction("reports")}><Flower2 size={15} />View Reports</button><button className="button secondary" onClick={() => onAction("schedule")}><CalendarClock size={15} />Manage Schedule</button></section>;
}

function AIRecommendation({ onDetails }: { onDetails: () => void }) {
  return (
    <section className="recommendation">
      <span className="recommendation-icon"><Sprout size={20} /></span>
      <div className="recommendation-copy"><strong>AI Recommendation</strong><p><b>Tomato is likely to need watering within the next 2 hours.</b> Based on demonstration moisture trends and predicted levels.</p></div>
      <button className="button recommendation-button" onClick={onDetails}>View Details <ChevronRight size={15} /></button>
    </section>
  );
}

function Dialog({ kind, plants, onClose }: { kind: ContentDialogState; plants: Plant[]; onClose: () => void }) {
  const titles = {
    notifications: "All notifications",
    "watering-events": "Watering history",
    reports: "Reports",
    schedule: "Watering schedule",
    recommendation: "Recommendation details",
  };
  const tomato = plants.find((plant) => plant.name.toLowerCase() === "tomato");
  return (
    <ModalFrame labelledBy="dialog-title" onClose={onClose}>
        <div className="modal-heading"><div><span className="eyebrow">WATERX DEMO</span><h2 id="dialog-title">{titles[kind]}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div>
        {kind === "notifications" ? <div className="dialog-list">{notifications.map((item) => <NotificationRow key={item.id} item={item} icon={<Info size={14} />} />)}</div>
          : kind === "watering-events" ? <div className="dialog-list">{wateringEvents.map((event) => <article className="event-row" key={event.id}><span className={`event-icon ${event.result.toLowerCase()}`}>{event.result === "Watered" ? <Check size={14} /> : <X size={14} />}</span><div className="event-copy"><div className="row-title"><strong>{event.plant} · {event.result}</strong><time>{event.time}</time></div><p>{event.detail}</p></div></article>)}</div>
          : kind === "reports" ? <div className="dialog-content"><BarChartIcon /><p>Reports will summarize your garden&apos;s watering and moisture history.</p><div className="report-stat"><span>Water used this week</span><strong>{dashboardMetrics.weeklyWaterUsedLiters} L</strong></div><div className="report-stat"><span>Plants monitored</span><strong>{plants.length}</strong></div><span className="form-note">Report data shown here is for demonstration only.</span></div>
          : kind === "schedule" ? <div className="dialog-list schedule-list">{plants.map((plant) => <div className="schedule-item" key={plant.id}><span className="schedule-plant"><Leaf size={15} />{plant.name}</span><span>{plant.nextWatering}</span></div>)}<p className="form-note">Schedule editing is not available in this demonstration.</p></div>
          : <div className="dialog-content"><span className="recommendation-icon"><Sprout size={21} /></span><p><b>Tomato is likely to need watering within the next 2 hours.</b></p><p>Its demonstration soil moisture is {tomato?.moisture ?? 32}%, below the configured {tomato?.threshold ?? 38}% threshold. This forecast is based on sample moisture trends and is not live AI output.</p><div className="recommendation-detail"><Droplet size={15} />Current sample moisture: <b>{tomato?.moisture ?? 32}%</b><span>Threshold: {tomato?.threshold ?? 38}%</span></div><p className="form-note">No watering action has been started.</p></div>}
        <div className="modal-actions"><button className="button primary" onClick={onClose}>Done</button></div>
    </ModalFrame>
  );
}

function BarChartIcon() {
  return <span className="report-icon"><Gauge size={21} /></span>;
}

interface DashboardProps {
  activePage: string;
  onNavigate: (page: string) => void;
}

export function Dashboard({ activePage, onNavigate }: DashboardProps) {
  const [search, setSearch] = useState("");
  const [plants, setPlants] = useState(initialPlants);
  const [dialog, setDialog] = useState<DialogState>(null);
  const filteredPlants = useMemo(() => plants.filter((plant) => `${plant.name} ${plant.category} ${plant.status}`.toLowerCase().includes(search.trim().toLowerCase())), [plants, search]);

  function addPlant(plant: Plant) {
    setPlants((current) => [...current, plant]);
  }

  return (
    <div className="app-shell">
      <Sidebar activePage={activePage} onNavigate={onNavigate} />
      <main className="main-column">
        <Topbar search={search} onSearch={setSearch} onNotifications={() => setDialog("notifications")} />
        {activePage === "Dashboard" ? (
          <div className="dashboard-content">
            <div className="page-heading"><div><p className="eyebrow">YOUR GARDEN AT A GLANCE</p><h1>Smart Plant Water Management System</h1><p className="page-subtitle">Healthy Plants <i /> Optimized Water <i /> Smarter Decisions</p></div><span className="demo-pill"><span /> DEMO DATA</span></div>
            <SummaryCards plants={plants} />
            <div className="main-and-aside">
              <div className="primary-column">
                <PlantStatus plants={filteredPlants} />
                <div className="charts-grid"><SoilMoistureChart /><WaterTankChart /><AIPredictionChart /></div>
                <AIRecommendation onDetails={() => setDialog("recommendation")} />
              </div>
              <aside className="right-column" aria-label="Dashboard activity">
                <NotificationsPanel onViewAll={() => setDialog("notifications")} />
                <RecentEvents onViewAll={() => setDialog("watering-events")} />
                <QuickActions onAction={setDialog} />
              </aside>
            </div>
            <footer className="page-footnote"><Info size={12} /> All values shown are sample demonstration data and do not represent live sensor readings or validated model performance.</footer>
          </div>
        ) : (
          <div className="placeholder-page">
            <span className="placeholder-icon"><Leaf size={25} /></span><p className="eyebrow">WATERX WORKSPACE</p><h1>{activePage}</h1><p>This section is not implemented in the frontend demo yet.</p><button className="button primary" onClick={() => onNavigate("Dashboard")}>Back to Dashboard <ArrowRight size={15} /></button>
          </div>
        )}
      </main>
      {dialog === "add-plant" ? <AddPlantModal onClose={() => setDialog(null)} onAdd={addPlant} /> : dialog ? <Dialog kind={dialog} plants={plants} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
