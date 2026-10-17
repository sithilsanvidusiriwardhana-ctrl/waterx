export type PlantStatus = "Healthy" | "Needs Water" | "Too Wet" | "Sensor Error" | "Inactive";
export type ReadingSource = "sensor" | "simulation" | "demo" | "unavailable";

export interface MoisturePoint {
  recordedAt: string;
  moisture: number;
}

export interface PlantWateringEvent {
  id: string;
  date: string;
  volumeMl: number;
  durationSeconds: number;
  strategy: string;
  reason: string;
  outcome: "Completed" | "Skipped" | "Failed";
}

export interface PlantGrowth {
  heightCm?: number;
  leafCount?: number;
  biomassGrams?: number;
  stressStatus?: string;
}

export interface PlantPrediction {
  madeAt: string;
  targetTime: string;
  predictedMoisture: number;
  actualMoisture: number | null;
  modelName: string;
  algorithm: string;
}

export interface GrowthPoint {
  recordedAt: string;
  heightCm?: number;
  leafCount?: number;
  biomassGrams?: number;
}

export interface Plant {
  id: string;
  name: string;
  category: string;
  species: string;
  moisture: number | null;
  temperature: number | null;
  humidity: number | null;
  tankLevel: number | null;
  nextWatering: string;
  status: PlantStatus;
  threshold: number;
  image: string | null;
  active: boolean;
  readingSource: ReadingSource;
  readingTimestamp: string | null;
  minMoisture: number;
  optimalMoisture: number;
  maxMoisture: number;
  waterVolumeMl: number;
  maxCyclesPerDay: number;
  maxPumpRuntimeSeconds: number;
  wateringSchedule: string;
  lastWateredAt: string | null;
  moistureHistory: MoisturePoint[];
  wateringHistory: PlantWateringEvent[];
  growth: PlantGrowth | null;
  growthHistory: GrowthPoint[];
  predictions: PlantPrediction[];
  isDemoData: boolean;
}

export interface MoistureReading {
  day: string;
  values: Record<string, number>;
}

export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  time: string;
  tone: "warning" | "success" | "info" | "danger";
}

export interface WateringEvent {
  id: string;
  plant: string;
  result: "Watered" | "Skipped";
  detail: string;
  time: string;
}
