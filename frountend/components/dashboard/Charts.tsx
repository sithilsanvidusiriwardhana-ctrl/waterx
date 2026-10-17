"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
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
import { dashboardMetrics, moistureReadings, predictionReadings } from "@/lib/mock-data";

const chartColors = {
  basil: "#16a765",
  tomato: "#f59e0b",
  spider: "#3478ed",
  succulent: "#a44be7",
};

export function SoilMoistureChart() {
  const [period, setPeriod] = useState("Last 7 Days");
  const data = period === "Last 3 Days" ? moistureReadings.slice(-3) : moistureReadings;

  return (
    <section className="panel chart-panel soil-chart">
      <div className="panel-heading"><div><h2>Soil Moisture Trends</h2><p>Weekly readings across your plants</p></div><label className="select-wrap"><span className="sr-only">Select chart period</span><select value={period} onChange={(event) => setPeriod(event.target.value)}><option>Last 7 Days</option><option>Last 3 Days</option></select><ChevronDown size={13} /></label></div>
      <div className="chart-canvas">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="#edf1f6" strokeDasharray="3 3" vertical />
            <XAxis dataKey="day" tick={{ fill: "#77859a", fontSize: 9 }} tickLine={false} axisLine={{ stroke: "#dce4ed" }} />
            <YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tick={{ fill: "#77859a", fontSize: 9 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5ebf2", fontSize: 11 }} formatter={(value) => [`${value}%`, "Moisture"]} />
            <Legend verticalAlign="bottom" height={22} iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 9, color: "#4b5a70" }} />
            <Line name="Basil" type="monotone" dataKey="basil" stroke={chartColors.basil} strokeWidth={2} dot={{ r: 2, fill: chartColors.basil }} />
            <Line name="Tomato" type="monotone" dataKey="tomato" stroke={chartColors.tomato} strokeWidth={2} dot={{ r: 2, fill: chartColors.tomato }} />
            <Line name="Spider Plant" type="monotone" dataKey="spiderPlant" stroke={chartColors.spider} strokeWidth={2} dot={{ r: 2, fill: chartColors.spider }} />
            <Line name="Succulent" type="monotone" dataKey="succulent" stroke={chartColors.succulent} strokeWidth={2} dot={{ r: 2, fill: chartColors.succulent }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function WaterTankChart() {
  return (
    <section className="panel chart-panel tank-chart">
      <div className="panel-heading"><div><h2>Water Tank Level</h2><p>Shared reservoir capacity</p></div></div>
      <div className="tank-ring">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart data={[{ name: "Tank", value: dashboardMetrics.tankLevelPercent, fill: "#2875e8" }]} startAngle={90} endAngle={-270} innerRadius="76%" outerRadius="96%" barSize={12}>
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar dataKey="value" cornerRadius={9} background={{ fill: "#edf2f8" }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="tank-ring-label"><strong>{dashboardMetrics.tankLevelPercent}%</strong><span>{(dashboardMetrics.tankCapacityLiters - dashboardMetrics.tankUsedLiters).toFixed(1)} L remaining</span></div>
      </div>
      <div className="tank-stats"><div><span>Total Capacity</span><strong>{dashboardMetrics.tankCapacityLiters} L</strong></div><div><span>Used</span><strong>{dashboardMetrics.tankUsedLiters} L</strong></div></div>
    </section>
  );
}

export function AIPredictionChart() {
  return (
    <section className="panel chart-panel prediction-chart">
      <div className="panel-heading"><div><h2>AI Prediction <span className="heading-muted">(Soil Moisture)</span></h2><p>Tomato · next six hours</p></div><span className="chart-period">Next 6 Hours <ChevronDown size={12} /></span></div>
      <div className="chart-canvas prediction-canvas">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={predictionReadings} margin={{ top: 7, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="#edf1f6" strokeDasharray="3 3" />
            <XAxis dataKey="time" tick={{ fill: "#77859a", fontSize: 9 }} tickLine={false} axisLine={{ stroke: "#dce4ed" }} />
            <YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tick={{ fill: "#77859a", fontSize: 9 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e5ebf2", fontSize: 11 }} formatter={(value, name) => [`${value}%`, name]} />
            <Area dataKey="upper" stroke="none" fill="#e8efff" fillOpacity={0.75} legendType="none" tooltipType="none" />
            <Area dataKey="lower" stroke="none" fill="#fff" fillOpacity={1} legendType="none" tooltipType="none" />
            <Line name="Observed" type="monotone" dataKey="observed" stroke="#16a765" strokeWidth={2} dot={false} />
            <Line name="Predicted" type="monotone" dataKey="predicted" stroke="#3478ed" strokeWidth={2} strokeDasharray="5 4" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-legend"><span><i className="legend-dot observed" />Observed</span><span><i className="legend-dot predicted" />Predicted</span><span className="uncertainty-key">Shaded area: uncertainty</span></div>
      <p className="chart-disclaimer">Demonstration prediction · not live AI output</p>
    </section>
  );
}
