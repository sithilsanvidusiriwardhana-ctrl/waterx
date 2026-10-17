"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Activity, Droplet, Leaf, Plus, Search, Sprout, Thermometer, X } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AddPlantModal } from "@/components/plants/AddPlantModal";
import { ModalFrame } from "@/components/shared/ModalFrame";
import { usePlants } from "@/context/PlantsContext";
import { statusClass } from "@/lib/plants";
import type { Plant, PlantStatus } from "@/lib/types";

type SortMode = "name" | "moisture" | "lastWatered";
type ConfirmAction = { plant: Plant; action: "delete" | "toggle" } | null;

const statusOptions: PlantStatus[] = ["Healthy", "Needs Water", "Too Wet", "Sensor Error", "Inactive"];

function formatTime(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function PlantCard({ plant, onEdit, onConfirm }: {
  plant: Plant;
  onEdit: (plant: Plant) => void;
  onConfirm: (plant: Plant, action: "delete" | "toggle") => void;
}) {
  return (
    <article className="panel plant-library-card">
      <div className="plant-library-image">
        {plant.image
          ? <Image src={plant.image} alt={`${plant.name} plant`} width={480} height={280} unoptimized />
          : <span aria-label="No plant photograph"><Leaf size={36} /></span>}
        <span className={`status-badge ${statusClass(plant.status)}`}><i />{plant.status}</span>
      </div>
      <div className="plant-library-body">
        <div className="plant-library-title">
          <div><p className="eyebrow">{plant.category}</p><h2>{plant.name}</h2><p>{plant.species}</p></div>
          <span className="plant-id-short">ID · {plant.id.slice(0, 8)}</span>
        </div>
        <div className="plant-library-metrics">
          <div><Droplet size={16} /><span>Soil moisture</span><strong>{plant.moisture === null ? "Unavailable" : `${plant.moisture}%`}</strong></div>
          <div><Thermometer size={16} /><span>Temperature</span><strong>{plant.temperature === null ? "Unavailable" : `${plant.temperature}°C`}</strong></div>
          <div><Activity size={16} /><span>Last watered</span><strong>{formatTime(plant.lastWateredAt)}</strong></div>
        </div>
        <div className="plant-schedule-line"><span>Next watering</span><strong>{plant.wateringSchedule || "Not scheduled"}</strong></div>
        {plant.readingSource === "unavailable" || plant.moisture === null
          ? <p className="sensor-note" role="status">No sensor reading is available for this plant.</p>
          : plant.isDemoData && <p className="sensor-note demo-reading-note">Demonstration reading · not live sensor data</p>}
        <div className="plant-card-actions">
          <Link className="button primary" href={`/plants/${encodeURIComponent(plant.id)}`}>View Details</Link>
          <button type="button" className="button secondary" onClick={() => onEdit(plant)}>Edit</button>
          <button type="button" className="button secondary" onClick={() => onConfirm(plant, "toggle")}>{plant.active ? "Deactivate" : "Reactivate"}</button>
          <button type="button" className="button danger-button" onClick={() => onConfirm(plant, "delete")}>Delete</button>
        </div>
      </div>
    </article>
  );
}

export function MyPlantsPage() {
  const { plants, isLoading, addPlant, updatePlant, togglePlantActive, deletePlant, storageError, clearStorageError } = usePlants();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [sort, setSort] = useState<SortMode>("name");
  const [editing, setEditing] = useState<Plant | undefined>();
  const [isAdding, setIsAdding] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmAction>(null);
  const [toast, setToast] = useState("");

  const filteredPlants = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const result = plants.filter((plant) => {
      const matchesQuery = !query || `${plant.name} ${plant.species} ${plant.category} ${plant.id}`.toLocaleLowerCase().includes(query);
      return matchesQuery && (status === "All statuses" || plant.status === status);
    });
    return result.sort((left, right) => {
      if (sort === "moisture") {
        if (left.moisture === null) return right.moisture === null ? 0 : 1;
        if (right.moisture === null) return -1;
        return left.moisture - right.moisture;
      }
      if (sort === "lastWatered") {
        if (!left.lastWateredAt) return right.lastWateredAt ? 1 : 0;
        if (!right.lastWateredAt) return -1;
        return new Date(right.lastWateredAt).getTime() - new Date(left.lastWateredAt).getTime();
      }
      return left.name.localeCompare(right.name);
    });
  }, [plants, search, sort, status]);

  const measured = plants.filter((plant) => plant.active && plant.moisture !== null);
  const averageMoisture = measured.length
    ? `${Math.round(measured.reduce((total, plant) => total + (plant.moisture ?? 0), 0) / measured.length)}%`
    : "—";
  const healthyCount = plants.filter((plant) => plant.active && plant.status === "Healthy").length;
  const attentionCount = plants.filter((plant) => plant.active && ["Needs Water", "Too Wet", "Sensor Error"].includes(plant.status)).length;

  function savePlant(plant: Plant) {
    if (editing) {
      updatePlant(plant.id, plant);
      setToast(`${plant.name} updated.`);
      setEditing(undefined);
    } else {
      addPlant(plant);
      setToast(`${plant.name} added. Sensor readings will appear when available.`);
      setIsAdding(false);
    }
  }

  function confirmAction() {
    if (!confirm) return;
    const { plant, action } = confirm;
    if (action === "delete") {
      deletePlant(plant.id);
      setToast(`${plant.name} and its plant-specific demonstration history were deleted.`);
    } else {
      togglePlantActive(plant.id);
      setToast(`${plant.name} ${plant.active ? "deactivated" : "reactivated"}.`);
    }
    setConfirm(null);
  }

  if (isLoading) {
    return <AppShell showSearch={false}><div className="dashboard-content"><div className="plant-loading" role="status">Loading saved plant data…</div></div></AppShell>;
  }

  return (
    <AppShell showSearch={false}>
      <div className="dashboard-content my-plants-page">
        <div className="page-heading plants-page-heading">
          <div>
            <p className="eyebrow">YOUR GARDEN</p>
            <h1>My Plants</h1>
            <p className="page-subtitle">Monitor and manage your plants in one place.</p>
          </div>
          <button type="button" className="button primary add-plant-button" onClick={() => setIsAdding(true)}><Plus size={17} />Add Plant</button>
        </div>

        {storageError && <div className="storage-warning" role="alert"><span>{storageError}</span><button type="button" onClick={clearStorageError} aria-label="Dismiss storage warning"><X size={16} /></button></div>}

        <section className="summary-grid plant-summary-grid" aria-label="Plant summary">
          <article className="summary-card"><span className="summary-icon green"><Sprout size={20} /></span><div className="summary-content"><span className="summary-label">Total Plants</span><strong>{plants.length}</strong><small className="muted">{plants.filter((plant) => plant.active).length} active</small></div></article>
          <article className="summary-card"><span className="summary-icon mint"><Leaf size={20} /></span><div className="summary-content"><span className="summary-label">Healthy Plants</span><strong>{healthyCount}</strong><small className="muted">Within configured range</small></div></article>
          <article className="summary-card"><span className="summary-icon purple"><Activity size={20} /></span><div className="summary-content"><span className="summary-label">Plants Needing Attention</span><strong>{attentionCount}</strong><small className="muted">Includes sensor issues</small></div></article>
          <article className="summary-card"><span className="summary-icon blue"><Droplet size={20} /></span><div className="summary-content"><span className="summary-label">Average Soil Moisture</span><strong>{averageMoisture}</strong><small className="muted">{measured.length} available readings</small></div></article>
        </section>

        <section className="panel plant-library-panel" aria-labelledby="plant-list-title">
          <div className="plant-list-heading"><div><h2 id="plant-list-title">All plants</h2><p>{filteredPlants.length} of {plants.length} plants</p></div>
            <div className="plant-filters">
              <label className="plant-search"><Search size={16} /><span className="sr-only">Search plants</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or species" /></label>
              <label className="filter-select"><span className="sr-only">Filter plants by status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option>All statuses</option>{statusOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
              <label className="filter-select"><span className="sr-only">Sort plants</span><select value={sort} onChange={(event) => setSort(event.target.value as SortMode)}><option value="name">Sort: Name</option><option value="moisture">Sort: Moisture</option><option value="lastWatered">Sort: Last watered</option></select></label>
            </div>
          </div>
          {filteredPlants.length
            ? <div className="plant-library-grid">{filteredPlants.map((plant) => <PlantCard key={plant.id} plant={plant} onEdit={setEditing} onConfirm={(selected, action) => setConfirm({ plant: selected, action })} />)}</div>
            : <div className="plant-library-empty"><Sprout size={28} /><strong>{plants.length ? "No plants match your filters" : "Your garden is ready to grow"}</strong><span>{plants.length ? "Try a different search or status." : "Add a plant to get started. New plants won't show readings until a sensor is connected."}</span></div>}
        </section>
      </div>

      {(isAdding || editing) && <AddPlantModal plant={editing} onClose={() => { setIsAdding(false); setEditing(undefined); }} onSave={savePlant} />}
      {confirm && <ModalFrame labelledBy="plant-confirm-title" onClose={() => setConfirm(null)}>
        <div className="modal-heading"><div><span className="eyebrow">PLANT MANAGEMENT</span><h2 id="plant-confirm-title">{confirm.action === "delete" ? "Delete this plant?" : `${confirm.plant.active ? "Deactivate" : "Reactivate"} ${confirm.plant.name}?`}</h2></div><button type="button" className="icon-button" onClick={() => setConfirm(null)} aria-label="Close dialog"><X size={19} /></button></div>
        <div className="dialog-content">{confirm.action === "delete"
          ? <p>This permanently removes {confirm.plant.name}, its configuration, and this plant’s associated demonstration readings, growth data, and watering history from this browser. Other plants and dashboard data are not affected.</p>
          : <p>{confirm.plant.active ? "This plant will be marked inactive and excluded from active health summaries." : "This plant will be included in active health summaries again."} Its configuration and history will be kept.</p>}</div>
        <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setConfirm(null)}>Cancel</button><button type="button" className={confirm.action === "delete" ? "button danger-button" : "button primary"} onClick={confirmAction}>{confirm.action === "delete" ? "Delete plant" : confirm.plant.active ? "Deactivate" : "Reactivate"}</button></div>
      </ModalFrame>}
      {toast && <div className="plant-toast" role="status" aria-live="polite"><span>{toast}</span><button type="button" className="icon-button" onClick={() => setToast("")} aria-label="Dismiss notification"><X size={15} /></button></div>}
    </AppShell>
  );
}
