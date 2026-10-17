"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown } from "lucide-react";
import type { DashboardSnapshot } from "@/lib/api";
import type { Plant } from "@/lib/types";

const chartColors = ["#16a765", "#f59e0b", "#3478ed", "#a44be7", "#ed6a5a", "#00a9a5"];

function displayDay(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function SoilMoistureChart({
  readings,
  plants,
}: {
  readings: DashboardSnapshot["soilMoisture"];
  plants: Plant[];
}) {
  const [period, setPeriod] = useState("Last 7 Days");
  const data: Array<Record<string, number | string>> = (period === "Last 3 Days" ? readings.slice(-3) : readings).map((point) => ({
    day: displayDay(point.day),
    ...point.values,
  }));
  const activePlants = plants.filter((plant) =>
    data.some((point) => typeof point[plant.id] === "number")
  );

  return (
    <section className="panel chart-panel soil-chart">
      <div className="panel-heading"><div><h2>Soil Moisture Trends</h2><p>Recorded simulation readings by plant</p></div><label className="select-wrap"><span className="sr-only">Select chart period</span><select value={period} onChange={(event) => setPeriod(event.target.value)}><option>Last 7 Days</option><option>Last 3 Days</option></select><ChevronDown size={13} /></label></div>
      {data.length && activePlants.length ? <div className="chart-canvas">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="#edf1f6" strokeDasharray="3 3" vertical />
            <XAxis dataKey="day" tick={{ fill: "#77859a", fontSize: 9 }} tickLine={false} axisLine={{ stroke: "#dce4ed" }} />
            <YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tick={{ fill: "#77859a", fontSize: 9 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5ebf2", fontSize: 11 }} formatter={(value) => [`${value}%`, "Moisture"]} />
            <Legend verticalAlign="bottom" height={22} iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 9, color: "#4b5a70" }} />
            {activePlants.map((plant, index) => <Line key={plant.id} name={plant.name} type="monotone" dataKey={plant.id} stroke={chartColors[index % chartColors.length]} strokeWidth={2} dot={{ r: 2 }} connectNulls />)}
          </LineChart>
        </ResponsiveContainer>
      </div> : <div className="detail-empty compact-empty"><strong>No moisture history</strong><span>Stored sensor-reading records from a simulation run will appear here.</span></div>}
    </section>
  );
}

export function WaterTankChart({ snapshot }: { snapshot: DashboardSnapshot | null }) {
  const tank = snapshot?.tank ?? null;
  const remainingLiters = tank ? tank.levelMl / 1000 : null;
  const capacityLiters = tank ? tank.capacityMl / 1000 : null;
  return (
    <section className="panel chart-panel tank-chart">
      <div className="panel-heading"><div><h2>Water Tank Level</h2><p>Latest stored simulation record</p></div></div>
      {tank ? <>
        <div className="tank-ring">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart data={[{ name: "Tank", value: tank.levelPercent, fill: "#2875e8" }]} startAngle={90} endAngle={-270} innerRadius="76%" outerRadius="96%" barSize={12}>
              <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
              <RadialBar dataKey="value" cornerRadius={9} background={{ fill: "#edf2f8" }} />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="tank-ring-label"><strong>{tank.levelPercent}%</strong><span>{remainingLiters?.toFixed(1)} L remaining</span></div>
        </div>
        <div className="tank-stats"><div><span>Total Capacity</span><strong>{capacityLiters?.toFixed(1)} L</strong></div><div><span>Remaining</span><strong>{remainingLiters?.toFixed(1)} L</strong></div></div>
        <p className="chart-data-label">{new Date(tank.recordedAt).toLocaleString()}</p>
      </> : <div className="detail-empty compact-empty"><strong>No tank-level record</strong><span>Tank capacity and level have not been recorded by a simulation.</span></div>}
    </section>
  );
}

export function AIPredictionChart({ predictions }: { predictions: DashboardSnapshot["predictions"] }) {
  const rows = [...predictions].reverse().slice(-12).map((prediction) => ({
    label: `${prediction.plant} · ${new Date(prediction.targetTime).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric" })}`,
    predicted: prediction.predictedMoisture,
    actual: prediction.actualMoisture,
  }));
  return (
    <section className="panel chart-panel prediction-chart">
      <div className="panel-heading"><div><h2>Stored Moisture Predictions</h2><p>Backend simulation output · no live AI service</p></div><span className="chart-period">Saved records <ChevronDown size={12} /></span></div>
      {rows.length ? <>
        <div className="chart-canvas prediction-canvas">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 7, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#edf1f6" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: "#77859a", fontSize: 9 }} tickLine={false} axisLine={{ stroke: "#dce4ed" }} />
              <YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tick={{ fill: "#77859a", fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5ebf2", fontSize: 11 }} formatter={(value, name) => [`${value}%`, name]} />
              <Line name="Predicted" type="monotone" dataKey="predicted" stroke="#3478ed" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2 }} />
              <Line name="Actual" type="monotone" dataKey="actual" stroke="#16a765" strokeWidth={2} dot={{ r: 2 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-legend"><span><i className="legend-dot observed" />Recorded actual</span><span><i className="legend-dot predicted" />Saved prediction</span></div>
      </> : <div className="detail-empty compact-empty"><strong>No saved predictions</strong><span>Predictions are available only after a backend simulation stores them.</span></div>}
    </section>
  );
}
