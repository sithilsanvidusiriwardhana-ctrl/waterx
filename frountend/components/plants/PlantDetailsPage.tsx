"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  ArrowLeft,
  CalendarClock,
  Check,
  Droplet,
  Leaf,
  Sprout,
  Thermometer,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/AppShell";
import { usePlants } from "@/context/PlantsContext";
import { apiErrorMessage, getPlant } from "@/lib/api";
import { readingSourceLabel, statusClass } from "@/lib/plants";
import type { Plant } from "@/lib/types";
import type { PlantConfiguration } from "@/lib/plants";

type TimeRange = "24h" | "7d" | "30d";

function readableDate(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function MoistureTrend({ plant }: { plant: Plant }) {
  const [range, setRange] = useState<TimeRange>("7d");
  const days = range === "24h" ? 1 : range === "7d" ? 7 : 30;
  const chartData = useMemo(() => {
    if (plant.isDemoData) return plant.moistureHistory.slice(-days).map((point, index) => ({
      ...point,
      label: new Date(point.recordedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) || `Sample ${index + 1}`,
    }));
    const latestPointTime = Math.max(0, ...plant.moistureHistory.map((point) => new Date(point.recordedAt).getTime()));
    const since = latestPointTime - days * 24 * 60 * 60 * 1000;
    return plant.moistureHistory.filter((point) => new Date(point.recordedAt).getTime() >= since).map((point) => ({
      ...point,
      label: new Date(point.recordedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    }));
  }, [days, plant.isDemoData, plant.moistureHistory]);

  return (
    <section className="panel detail-panel" aria-labelledby="moisture-trend-title">
      <div className="detail-panel-heading"><div><h2 id="moisture-trend-title">Soil moisture monitoring</h2><p>Moisture readings and this plant’s configured range</p></div>
        <label className="filter-select"><span className="sr-only">Select moisture chart time range</span><select value={range} onChange={(event) => setRange(event.target.value as TimeRange)}><option value="24h">24 hours</option><option value="7d">7 days</option><option value="30d">30 days</option></select></label>
      </div>
      <p className="chart-data-label">{plant.readingSource === "simulation" ? "Stored simulation history · not live sensor readings" : "Stored sensor history · timestamps shown in local time"}</p>
      {chartData.length ? <div className="detail-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 12, right: 14, left: -14, bottom: 3 }}>
            <CartesianGrid stroke="#e8edf3" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fill: "#75839a", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#dce4ed" }} />
            <YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tick={{ fill: "#75839a", fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip formatter={(value) => [`${value}%`, "Soil moisture"]} />
            <ReferenceLine y={plant.minMoisture} stroke="#d99b35" strokeDasharray="4 4" />
            <ReferenceLine y={plant.optimalMoisture} stroke="#18a56a" strokeDasharray="4 4" />
            <ReferenceLine y={plant.maxMoisture} stroke="#d35a5a" strokeDasharray="4 4" />
            <Line name="Moisture" dataKey="moisture" type="monotone" stroke="#2875e8" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div> : <div className="detail-empty"><Droplet size={23} /><strong>No readings for this time range</strong><span>Moisture readings will appear here when available. No values have been generated for this plant.</span></div>}
      <div className="threshold-legend">
        <span><i className="threshold-current" />Current: {plant.moisture === null ? "Unavailable" : `${plant.moisture}%`}</span>
        <span><i className="threshold-min" />Minimum: {plant.minMoisture}%</span>
        <span><i className="threshold-optimal" />Optimal: {plant.optimalMoisture}%</span>
        <span><i className="threshold-max" />Maximum: {plant.maxMoisture}%</span>
      </div>
    </section>
  );
}

function PlantSettings({ plant, onSave }: { plant: Plant; onSave: (updates: Partial<Plant>) => Promise<void> }) {
  const [draft, setDraft] = useState<PlantConfiguration>(() => ({
    name: plant.name,
    species: plant.species,
    image: plant.image,
    minMoisture: plant.minMoisture,
    optimalMoisture: plant.optimalMoisture,
    maxMoisture: plant.maxMoisture,
    waterVolumeMl: plant.waterVolumeMl,
    maxCyclesPerDay: plant.maxCyclesPerDay,
    maxPumpRuntimeSeconds: plant.maxPumpRuntimeSeconds,
    wateringSchedule: plant.wateringSchedule,
  }));
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  function cancel() {
    setDraft({
      name: plant.name,
      species: plant.species,
      image: plant.image,
      minMoisture: plant.minMoisture,
      optimalMoisture: plant.optimalMoisture,
      maxMoisture: plant.maxMoisture,
      waterVolumeMl: plant.waterVolumeMl,
      maxCyclesPerDay: plant.maxCyclesPerDay,
      maxPumpRuntimeSeconds: plant.maxPumpRuntimeSeconds,
      wateringSchedule: plant.wateringSchedule,
    });
    setError("");
    setSaved(false);
  }

  function update<K extends keyof PlantConfiguration>(key: K, value: PlantConfiguration[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
    setSaved(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.minMoisture >= draft.optimalMoisture || draft.optimalMoisture >= draft.maxMoisture) {
      setError("Moisture thresholds must be ordered: minimum < optimal < maximum.");
      return;
    }
    const configuration = { ...draft, category: draft.species, threshold: draft.minMoisture, nextWatering: draft.wateringSchedule.trim() || "Not scheduled" };
    setSaving(true);
    try {
      await onSave(configuration);
      setSaved(true);
      setError("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Plant settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel detail-panel" aria-labelledby="plant-settings-title">
      <div className="detail-panel-heading"><div><h2 id="plant-settings-title">Plant-specific settings</h2><p>Configuration applies only to {plant.name}.</p></div></div>
      <form onSubmit={submit}>
        <div className="plant-form-grid detail-settings-grid">
          <label className="form-field">Plant name<input required maxLength={60} value={draft.name} onChange={(event) => update("name", event.target.value)} /></label>
          <label className="form-field">Plant species<input required maxLength={80} value={draft.species} onChange={(event) => update("species", event.target.value)} /></label>
          <label className="form-field">Minimum moisture %<input type="number" min="0" max="99" required value={draft.minMoisture} onChange={(event) => update("minMoisture", Number(event.target.value))} /></label>
          <label className="form-field">Optimal moisture %<input type="number" min="1" max="100" required value={draft.optimalMoisture} onChange={(event) => update("optimalMoisture", Number(event.target.value))} /></label>
          <label className="form-field">Maximum moisture %<input type="number" min="2" max="100" required value={draft.maxMoisture} onChange={(event) => update("maxMoisture", Number(event.target.value))} /></label>
          <label className="form-field">Water per cycle (mL)<input type="number" min="1" max="5000" required value={draft.waterVolumeMl} onChange={(event) => update("waterVolumeMl", Number(event.target.value))} /></label>
          <label className="form-field">Daily watering limit<input type="number" min="1" max="24" required value={draft.maxCyclesPerDay} onChange={(event) => update("maxCyclesPerDay", Number(event.target.value))} /></label>
          <label className="form-field">Maximum pump runtime (sec)<input type="number" min="1" max="600" required value={draft.maxPumpRuntimeSeconds} onChange={(event) => update("maxPumpRuntimeSeconds", Number(event.target.value))} /></label>
          <label className="form-field detail-settings-wide">Daily watering time<input type="time" value={draft.wateringSchedule} onChange={(event) => update("wateringSchedule", event.target.value)} /></label>
        </div>
        <p className="form-note">The backend stores a daily schedule time only.</p>
        {error && <p className="settings-error" role="alert">{error}</p>}
        {saved && <p className="inline-success" role="status"><Check size={14} /> Plant settings saved.</p>}
        <div className="settings-actions"><button className="button primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button><button className="button secondary" type="button" onClick={cancel} disabled={saving}>Cancel</button></div>
      </form>
    </section>
  );
}

function GrowthMonitoring({ plant }: { plant: Plant }) {
  const growth = plant.growth;
  const growthTrend = plant.growthHistory
    .filter((point) => point.heightCm !== undefined)
    .map((point) => ({
      ...point,
      label: new Date(point.recordedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    }));
  return (
    <section className="panel detail-panel" aria-labelledby="growth-title">
      <div className="detail-panel-heading"><div><h2 id="growth-title">Plant growth monitoring</h2><p>Growth observations recorded for this plant</p></div></div>
      {growth && Object.values(growth).some((value) => value !== undefined)
        ? <>
          <p className="chart-data-label">{plant.isDemoData ? "Stored simulation data" : "Recorded plant data"}</p>
          <div className="growth-metrics">
            <div><Sprout size={18} /><span>Plant height</span><strong>{growth.heightCm === undefined ? "Unavailable" : `${growth.heightCm} cm`}</strong></div>
            <div><Leaf size={18} /><span>Leaf count</span><strong>{growth.leafCount ?? "Unavailable"}</strong></div>
            <div><Activity size={18} /><span>Biomass</span><strong>{growth.biomassGrams === undefined ? "Not tracked" : `${growth.biomassGrams} g`}</strong></div>
            <div><Activity size={18} /><span>Plant stress</span><strong>{growth.stressStatus ?? "Not assessed"}</strong></div>
          </div>
        </>
        : <div className="detail-empty"><Sprout size={23} /><strong>No growth data available</strong><span>Height, leaf count, biomass, and stress information have not been recorded for this plant.</span></div>}
      <div className="growth-trend-section">
        <h3>Plant height trend</h3>
        <p className="chart-data-label">{plant.isDemoData ? "Stored simulation growth data" : "Recorded growth measurements"}</p>
        {growthTrend.length ? <div className="growth-trend-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={growthTrend} margin={{ top: 8, right: 12, left: -14, bottom: 3 }}>
              <CartesianGrid stroke="#e8edf3" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: "#75839a", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#dce4ed" }} />
              <YAxis tick={{ fill: "#75839a", fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value) => [`${value} cm`, "Plant height"]} />
              <Line name="Plant height" dataKey="heightCm" type="monotone" stroke="#18a56a" strokeWidth={2.5} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div> : <div className="detail-empty growth-empty"><Activity size={20} /><strong>No height measurements to chart</strong><span>A growth trend will appear when height measurements have been recorded.</span></div>}
      </div>
    </section>
  );
}

function PlantAIInsights({ plant }: { plant: Plant }) {
  const predictions = plant.predictions ?? [];
  const predictionData = predictions.map((prediction) => ({
    time: new Date(prediction.targetTime).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric" }),
    predicted: prediction.predictedMoisture,
    actual: prediction.actualMoisture,
  }));
  const latestPrediction = predictions.at(-1);

  return (
    <section className="panel detail-panel ai-insights" aria-labelledby="ai-insights-title">
      <div className="detail-panel-heading"><div><h2 id="ai-insights-title">Saved moisture predictions</h2><p>Persisted simulation forecasts · not live model output</p></div><span className="demo-model-status">{latestPrediction?.algorithm ?? "Not connected"}</span></div>
      {predictionData.length ? <div className="detail-chart ai-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={predictionData} margin={{ top: 12, right: 12, left: -14, bottom: 3 }}>
            <CartesianGrid stroke="#e8edf3" strokeDasharray="3 3" />
            <XAxis dataKey="time" tick={{ fill: "#75839a", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#dce4ed" }} />
            <YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tick={{ fill: "#75839a", fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip formatter={(value, name) => [`${value}%`, name]} />
            <Line name="Predicted moisture" dataKey="predicted" type="monotone" stroke="#7655ca" strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 4 }} />
            <Line name="Recorded actual" dataKey="actual" type="monotone" stroke="#18a56a" strokeWidth={2} dot={{ r: 3 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div> : <div className="detail-empty compact-empty"><Activity size={22} /><strong>No saved prediction is available</strong><span>Predictions are not generated by the dashboard. Run the backend simulator with the ai_assisted strategy to store forecast records.</span></div>}
      {latestPrediction && <div className="ai-explanation"><strong>Latest stored forecast</strong><p>{latestPrediction.modelName} ({latestPrediction.algorithm}) predicted {latestPrediction.predictedMoisture}% at {readableDate(latestPrediction.targetTime)}.</p><p>Recorded actual: {latestPrediction.actualMoisture === null ? "Not yet available" : `${latestPrediction.actualMoisture}%`}</p></div>}
      <p className="safety-note">Forecasts are informational only. No watering operation is exposed by the frontend; the simulator&apos;s safety checks remain in its backend engine.</p>
    </section>
  );
}

export function PlantDetailsPage({ plantId }: { plantId: string }) {
  const { plants, isLoading, updatePlant, apiError, refreshPlants } = usePlants();
  const [detailPlant, setDetailPlant] = useState<Plant | null>(null);
  const [loadedPlantId, setLoadedPlantId] = useState("");
  const [detailError, setDetailError] = useState("");
  const [toast, setToast] = useState("");

  const refreshPlant = useCallback(async () => {
    try {
      setDetailPlant(await getPlant(plantId));
      setDetailError("");
    } catch (error) {
      setDetailError(apiErrorMessage(error));
    } finally {
      setLoadedPlantId(plantId);
    }
  }, [plantId]);

  useEffect(() => {
    let cancelled = false;
    getPlant(plantId)
      .then((plant) => {
        if (!cancelled) {
          setDetailPlant(plant);
          setDetailError("");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setDetailError(apiErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setLoadedPlantId(plantId);
      });
    return () => { cancelled = true; };
  }, [plantId]);

  const plant = detailPlant?.id === plantId ? detailPlant : plants.find((candidate) => candidate.id === plantId);

  if (isLoading || loadedPlantId !== plantId) {
    return <AppShell showSearch={false}><div className="dashboard-content"><div className="plant-loading" role="status">Loading saved plant data…</div></div></AppShell>;
  }

  if (!plant) {
    return <AppShell showSearch={false}><div className="dashboard-content"><section className="panel not-found-panel"><span className="placeholder-icon"><Leaf size={25} /></span><h1>{detailError ? "Plant details unavailable" : "Plant not found"}</h1><p>{detailError || "This plant ID is invalid or the plant has been removed."}</p>{detailError && <button type="button" className="button secondary" onClick={() => { void refreshPlant(); }}>Retry</button>}<Link className="button primary" href="/plants"><ArrowLeft size={15} />Back to My Plants</Link></section></div></AppShell>;
  }

  const status = plant.status;
  const readingText = plant.moisture === null ? "Unavailable" : `${plant.moisture}%`;

  return (
    <AppShell showSearch={false}>
      <div className="dashboard-content plant-detail-page">
        <Link className="back-to-plants" href="/plants"><ArrowLeft size={16} />Back to My Plants</Link>
        {apiError && <div className="storage-warning" role="alert"><span>{apiError}</span><button type="button" onClick={refreshPlants}>Retry</button></div>}
        <header className="plant-detail-header">
          <div className="plant-detail-photo">
            {plant.image ? <Image src={plant.image} alt={`${plant.name} plant`} width={220} height={220} unoptimized /> : <Leaf size={46} />}
          </div>
          <div className="plant-detail-title">
            <p className="eyebrow">PLANT DETAILS</p>
            <h1>{plant.name}</h1>
            <p>{plant.species}</p>
            <div className="plant-detail-badges"><span className={`status-badge ${statusClass(status)}`}><i />{status}</span><span className="plant-id-badge">Plant ID · {plant.id}</span></div>
          </div>
          <div className="plant-reading-card"><span>Current soil moisture</span><strong>{readingText}</strong><small>{readingSourceLabel(plant.readingSource)} · {readableDate(plant.readingTimestamp)}</small></div>
        </header>

        <section className="panel detail-panel plant-overview" aria-labelledby="plant-overview-title">
          <div className="detail-panel-heading"><div><h2 id="plant-overview-title">Plant overview</h2><p>Current status and care information for {plant.name}</p></div></div>
          <div className="overview-metrics">
            <div><Thermometer size={18} /><span>Temperature</span><strong>{plant.temperature === null ? "Unavailable" : `${plant.temperature}°C`}</strong></div>
            <div><Activity size={18} /><span>Humidity</span><strong>{plant.humidity === null ? "Unavailable" : `${plant.humidity}%`}</strong></div>
            <div><Droplet size={18} /><span>Last watering</span><strong>{readableDate(plant.lastWateredAt)}</strong></div>
            <div><CalendarClock size={18} /><span>Next scheduled watering</span><strong>{plant.wateringSchedule || "Not configured"}</strong></div>
          </div>
          {plant.readingSource === "simulation" && <p className="sensor-note demo-reading-note">Values shown are simulated database records, not live sensor measurements.</p>}
        </section>

        <MoistureTrend plant={plant} />

        <section className="panel detail-panel" aria-labelledby="watering-history-title">
          <div className="detail-panel-heading"><div><h2 id="watering-history-title">Watering history</h2><p>Watering events associated with this plant only</p></div></div>
          {plant.wateringHistory.length ? <div className="table-scroll"><table className="plant-history-table">
            <thead><tr><th>Date and time</th><th>Volume</th><th>Duration</th><th>Strategy</th><th>Reason</th><th>Outcome</th></tr></thead>
            <tbody>{plant.wateringHistory.map((event) => <tr key={event.id}>
              <td>{readableDate(event.date)}</td><td>{event.volumeMl} mL</td><td>{event.durationSeconds} sec</td><td>{event.strategy}</td><td>{event.reason}</td><td><span className={`event-outcome ${event.outcome.toLowerCase()}`}>{event.outcome}</span></td>
            </tr>)}</tbody>
          </table></div> : <div className="detail-empty"><Droplet size={23} /><strong>No watering history</strong><span>No watering events have been recorded for this plant.</span></div>}
        </section>

        <GrowthMonitoring plant={plant} />
        <PlantAIInsights plant={plant} />
        <PlantSettings plant={plant} onSave={async (updates) => { await updatePlant(plant.id, updates); await refreshPlant(); setToast("Plant settings saved."); }} />
      </div>
      {toast && <div className="plant-toast" role="status" aria-live="polite"><span>{toast}</span><button type="button" className="icon-button" onClick={() => setToast("")} aria-label="Dismiss notification"><X size={15} /></button></div>}
    </AppShell>
  );
}
