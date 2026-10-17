"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
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
import { AppShell } from "@/components/layout/AppShell";
import { AddPlantModal } from "@/components/plants/AddPlantModal";
import { AIPredictionChart, SoilMoistureChart, WaterTankChart } from "@/components/dashboard/Charts";
import { ModalFrame } from "@/components/shared/ModalFrame";
import { getDashboard, type DashboardSnapshot } from "@/lib/api";
import { usePlants } from "@/context/PlantsContext";
import type { NotificationItem, Plant } from "@/lib/types";

type DialogState = "add-plant" | "notifications" | "watering-events" | "reports" | "schedule" | "recommendation" | null;
type ContentDialogState = Exclude<DialogState, "add-plant" | null>;

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function SummaryCards({ plants, snapshot }: { plants: Plant[]; snapshot: DashboardSnapshot | null }) {
  const healthyCount = plants.filter((plant) => plant.status === "Healthy").length;
  const attentionCount = plants.filter((plant) => ["Needs Water", "Too Wet", "Sensor Error"].includes(plant.status)).length;
  const tank = snapshot?.tank;
  return (
    <section className="summary-grid" aria-label="Dashboard summary">
      <article className="summary-card">
        <span className="summary-icon green"><Sprout size={20} /></span>
        <div className="summary-content"><span className="summary-label">Total Plants</span><strong>{plants.length}</strong><small><b>{healthyCount} Healthy</b><i /> <em>{attentionCount} Needs Attention</em></small></div>
      </article>
      <article className="summary-card">
        <span className="summary-icon blue"><Droplet size={21} fill="currentColor" /></span>
        <div className="summary-content"><span className="summary-label">Water Tank Level</span><strong>{tank ? `${tank.levelPercent}%` : "—"}</strong><div className="mini-progress"><i style={{ width: `${tank?.levelPercent ?? 0}%` }} /></div><small className="muted">{tank ? `${(tank.levelMl / 1000).toFixed(1)} L remaining` : "No tank record"}</small></div>
      </article>
      <article className="summary-card">
        <span className="summary-icon mint"><Droplets size={20} /></span>
        <div className="summary-content"><span className="summary-label">Water Used · 7 Days</span><strong>{snapshot ? `${(snapshot.weeklyWaterUsedMl / 1000).toFixed(2)} L` : "—"}</strong><small className="muted">{snapshot ? "From persisted watering events" : "Backend data unavailable"}</small></div>
      </article>
      <article className="summary-card">
        <span className="summary-icon purple"><BrainCircuit size={20} /></span>
        <div className="summary-content"><span className="summary-label">Recent Prediction MAE</span><strong>{snapshot?.predictionMae === null || !snapshot ? "—" : `${snapshot.predictionMae.toFixed(1)} pp`}</strong><small className="muted">{snapshot?.predictionMae === null || !snapshot ? "No evaluated predictions" : "From saved prediction outcomes"}</small></div>
      </article>
    </section>
  );
}

function PlantCard({ plant }: { plant: Plant }) {
  return (
    <article className="plant-card">
      <div className="plant-heading">
        {plant.image ? <Image className="plant-image" src={plant.image} alt={`${plant.name} plant`} width={60} height={64} unoptimized /> : <span className="plant-image plant-image-placeholder" aria-label="No plant photograph"><Leaf size={20} /></span>}
        <div className="plant-ident"><h3>{plant.name}</h3><span>{plant.category}</span><span className={`status-badge ${plant.status.toLowerCase().replace(" ", "-")}`}><i />{plant.status}</span></div>
      </div>
      <div className="plant-metrics">
        <div><Droplet className="metric-blue" size={14} /><span>Soil Moisture</span><strong>{plant.moisture === null ? "Unavailable" : `${plant.moisture}%`}</strong></div>
        <div><Thermometer className="metric-red" size={14} /><span>Temperature</span><strong>{plant.temperature === null ? "Unavailable" : `${plant.temperature}°C`}</strong></div>
        <div><Gauge className="metric-blue" size={14} /><span>Tank Level</span><strong>{plant.tankLevel === null ? "Unavailable" : `${plant.tankLevel}%`}</strong></div>
      </div>
      <div className="next-watering"><CalendarDays size={14} /><div><span>Next watering</span><strong>{plant.nextWatering}</strong></div></div>
      {plant.readingSource === "simulation" && <p className="sensor-note demo-reading-note">Simulated database reading</p>}
    </article>
  );
}

function PlantStatus({ plants }: { plants: Plant[] }) {
  return (
    <section className="panel plant-section">
      <div className="section-heading"><div><h2>Plant Status</h2><p>Latest stored conditions; simulation readings may be historical</p></div><span className="section-count">{plants.length} plants</span></div>
      {plants.length > 0 ? <div className="plant-grid">{plants.map((plant) => <PlantCard key={plant.id} plant={plant} />)}</div> : <div className="empty-state"><Sprout size={24} /><strong>No plants found</strong><span>Add a plant or run the database seed command to populate examples.</span></div>}
    </section>
  );
}

function notificationFromAlert(alert: DashboardSnapshot["alerts"][number]): NotificationItem {
  const tone = alert.severity === "critical" ? "danger" : alert.severity === "warning" ? "warning" : "info";
  return {
    id: alert.id,
    title: alert.type.replaceAll("_", " "),
    description: alert.message,
    time: formatTime(alert.time),
    tone,
  };
}

function NotificationsPanel({ alerts, onViewAll }: { alerts: DashboardSnapshot["alerts"]; onViewAll: () => void }) {
  const iconByTone = { warning: CircleAlert, success: CheckCircle2, info: Info, danger: Droplet };
  return (
    <section className="panel side-panel">
      <div className="panel-heading compact"><div className="title-icon"><CircleAlert size={17} className="heading-blue" /><h2>Alerts &amp; Notifications</h2></div><button className="text-link" onClick={onViewAll}>View All <ArrowRight size={12} /></button></div>
      <div className="notification-list">
        {alerts.length ? alerts.slice(0, 4).map((alert) => {
          const item = notificationFromAlert(alert);
          const Icon = iconByTone[item.tone];
          return <NotificationRow key={item.id} item={item} icon={<Icon size={14} />} />;
        }) : <p className="empty-state compact-empty">No unresolved backend alerts.</p>}
      </div>
    </section>
  );
}

function NotificationRow({ item, icon }: { item: NotificationItem; icon: React.ReactNode }) {
  return <article className="notification-row"><span className={`notice-icon ${item.tone}`}>{icon}</span><div className="notification-copy"><div className="row-title"><strong>{item.title}</strong><time>{item.time}</time></div><p>{item.description}</p></div></article>;
}

function RecentEvents({ events, onViewAll }: { events: DashboardSnapshot["events"]; onViewAll: () => void }) {
  return (
    <section className="panel side-panel events-panel">
      <div className="panel-heading compact"><div><h2>Recent Watering Events</h2></div><button className="text-link" onClick={onViewAll}>View All <ArrowRight size={12} /></button></div>
      <div className="event-list">{events.length ? events.slice(0, 4).map((event) => <article className="event-row" key={event.id}><span className="event-icon watered"><Check size={14} /></span><div className="event-copy"><div className="row-title"><strong>{event.plant} · Simulated</strong><time>{formatTime(event.time)}</time></div><p>{event.detail}</p></div></article>) : <p className="empty-state compact-empty">No watering events have been recorded.</p>}</div>
    </section>
  );
}

function QuickActions({ onAction }: { onAction: (action: Exclude<DialogState, null>) => void }) {
  return <section className="panel quick-actions"><h2>Quick Actions</h2><button className="button primary" onClick={() => onAction("add-plant")}><Plus size={15} />Add New Plant</button><button className="button secondary" onClick={() => onAction("reports")}><Flower2 size={15} />View Reports</button><button className="button secondary" onClick={() => onAction("schedule")}><CalendarClock size={15} />Manage Schedule</button></section>;
}

function AIRecommendation({ prediction, onDetails }: { prediction: DashboardSnapshot["predictions"][number] | null; onDetails: () => void }) {
  return (
    <section className="recommendation">
      <span className="recommendation-icon"><Sprout size={20} /></span>
      <div className="recommendation-copy"><strong>Saved Moisture Forecast</strong><p>{prediction ? <><b>{prediction.plant}: {prediction.predictedMoisture}% predicted at {formatTime(prediction.targetTime)}.</b> Stored simulation output; it is not a watering instruction.</> : "No backend prediction is available. The dashboard does not create or infer forecasts."}</p></div>
      <button className="button recommendation-button" onClick={onDetails}>View Details <ChevronRight size={15} /></button>
    </section>
  );
}

function Dialog({ kind, plants, snapshot, onClose }: {
  kind: ContentDialogState;
  plants: Plant[];
  snapshot: DashboardSnapshot | null;
  onClose: () => void;
}) {
  const titles = {
    notifications: "All alerts",
    "watering-events": "Watering history",
    reports: "Reports",
    schedule: "Watering schedule",
    recommendation: "Saved forecast details",
  };
  const prediction = snapshot?.predictions[0] ?? null;
  return (
    <ModalFrame labelledBy="dialog-title" onClose={onClose}>
      <div className="modal-heading"><div><span className="eyebrow">WATERX DATABASE</span><h2 id="dialog-title">{titles[kind]}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div>
      {kind === "notifications" ? <div className="dialog-list">{snapshot?.alerts.length
        ? snapshot.alerts.map((alert) => <NotificationRow key={alert.id} item={notificationFromAlert(alert)} icon={<CircleAlert size={14} />} />)
        : <p className="dialog-content">No unresolved alerts are stored in the database.</p>}</div>
        : kind === "watering-events" ? <div className="dialog-list">{snapshot?.events.length
          ? snapshot.events.map((event) => <article className="event-row" key={event.id}><span className="event-icon watered"><Check size={14} /></span><div className="event-copy"><div className="row-title"><strong>{event.plant} · Simulated watering</strong><time>{formatTime(event.time)}</time></div><p>{event.detail}</p></div></article>)
          : <p className="dialog-content">No watering events are stored in the database.</p>}</div>
          : kind === "reports" ? <div className="dialog-content"><Gauge size={21} /><p>Database-backed report generation and exports are not implemented.</p><div className="report-stat"><span>Water used in the last 7 days</span><strong>{snapshot ? `${(snapshot.weeklyWaterUsedMl / 1000).toFixed(2)} L` : "Unavailable"}</strong></div><div className="report-stat"><span>Plants in database</span><strong>{plants.length}</strong></div></div>
            : kind === "schedule" ? <div className="dialog-list schedule-list">{plants.map((plant) => <div className="schedule-item" key={plant.id}><span className="schedule-plant"><Leaf size={15} />{plant.name}</span><span>{plant.nextWatering}</span></div>)}<p className="form-note">Daily schedule times are stored in plant profiles. The backend has no scheduler endpoint; running the simulator is a separate command-line operation.</p></div>
              : <div className="dialog-content"><span className="recommendation-icon"><Sprout size={21} /></span>{prediction
                ? <><p><b>{prediction.plant} · {prediction.predictedMoisture}% predicted moisture</b></p><p>{prediction.modelName} ({prediction.algorithm}) target: {formatTime(prediction.targetTime)}. Recorded actual: {prediction.actualMoisture === null ? "not available" : `${prediction.actualMoisture}%`}.</p></>
                : <p>No stored backend prediction is available.</p>}<p className="form-note">Forecasts are informational. No watering action is exposed to the frontend.</p></div>}
      <div className="modal-actions"><button className="button primary" onClick={onClose}>Done</button></div>
    </ModalFrame>
  );
}

export function Dashboard() {
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [dashboardError, setDashboardError] = useState("");
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const { plants, addPlant, isLoading: plantsLoading, apiError, refreshPlants } = usePlants();
  const filteredPlants = useMemo(() => plants.filter((plant) => `${plant.name} ${plant.category} ${plant.status}`.toLowerCase().includes(search.trim().toLowerCase())), [plants, search]);

  const refreshDashboard = useCallback(async () => {
    setDashboardLoading(true);
    try {
      setSnapshot(await getDashboard());
      setDashboardError("");
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : "Dashboard data could not be loaded.");
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getDashboard()
      .then((data) => {
        if (!cancelled) {
          setSnapshot(data);
          setDashboardError("");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDashboardError(error instanceof Error ? error.message : "Dashboard data could not be loaded.");
        }
      })
      .finally(() => {
        if (!cancelled) setDashboardLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function addDashboardPlant(plant: Plant) {
    await addPlant(plant);
    await refreshDashboard();
  }

  if (plantsLoading) {
    return <AppShell search={search} onSearch={setSearch} onNotifications={() => setDialog("notifications")}><div className="dashboard-content"><div className="plant-loading" role="status">Connecting to WaterX backend…</div></div></AppShell>;
  }

  const alerts = snapshot?.alerts ?? [];
  const events = snapshot?.events ?? [];
  const predictions = snapshot?.predictions ?? [];
  const latestPrediction = predictions[0] ?? null;

  return (
    <AppShell search={search} onSearch={setSearch} onNotifications={() => setDialog("notifications")}>
      <div className="dashboard-content">
        <div className="page-heading"><div><p className="eyebrow">YOUR GARDEN AT A GLANCE</p><h1>Smart Plant Water Management System</h1><p className="page-subtitle">Plant profiles <i /> Simulated records <i /> No physical device connection</p></div><span className="demo-pill"><span /> {snapshot?.latestSimulation ? `${snapshot.latestSimulation.strategy.replaceAll("_", " ").toUpperCase()} RUN` : "NO SIMULATION RUN"}</span></div>
        {(apiError || dashboardError) && <div className="storage-warning" role="alert"><span>{apiError || dashboardError}</span><button type="button" onClick={() => { void refreshPlants(); void refreshDashboard(); }}>Retry</button></div>}
        <SummaryCards plants={plants} snapshot={snapshot} />
        <div className="main-and-aside">
          <div className="primary-column">
            <PlantStatus plants={filteredPlants} />
            <div className="charts-grid"><SoilMoistureChart readings={snapshot?.soilMoisture ?? []} plants={plants} /><WaterTankChart snapshot={snapshot} /><AIPredictionChart predictions={predictions} /></div>
            <AIRecommendation prediction={latestPrediction} onDetails={() => setDialog("recommendation")} />
          </div>
          <aside className="right-column" aria-label="Dashboard activity">
            <NotificationsPanel alerts={alerts} onViewAll={() => setDialog("notifications")} />
            <RecentEvents events={events} onViewAll={() => setDialog("watering-events")} />
            <QuickActions onAction={setDialog} />
          </aside>
        </div>
        <footer className="page-footnote"><Info size={12} />{dashboardLoading ? "Refreshing persisted backend data…" : "Displayed sensor, tank, watering, growth, alert and prediction records come from saved simulator runs. They are not live hardware readings. Physical watering is not connected."}</footer>
      </div>
      {dialog === "add-plant" ? <AddPlantModal onClose={() => setDialog(null)} onSave={addDashboardPlant} /> : dialog ? <Dialog kind={dialog} plants={plants} snapshot={snapshot} onClose={() => setDialog(null)} /> : null}
    </AppShell>
  );
}
