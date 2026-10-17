import type { GrowthPoint, Plant, PlantStatus, ReadingSource } from "@/lib/types";

export const PLANTS_STORAGE_KEY = "waterx-plants";

export interface PlantConfiguration {
  name: string;
  species: string;
  image: string | null;
  minMoisture: number;
  optimalMoisture: number;
  maxMoisture: number;
  waterVolumeMl: number;
  maxCyclesPerDay: number;
  maxPumpRuntimeSeconds: number;
  wateringSchedule: string;
}

export function getPlantStatus(plant: Plant, now: number): PlantStatus {
  if (!plant.active) return "Inactive";
  if (plant.readingSource === "unavailable" || plant.moisture === null || !Number.isFinite(plant.moisture)) {
    return "Sensor Error";
  }
  if (plant.moisture < 0 || plant.moisture > 100 ||
    plant.minMoisture < 0 || plant.maxMoisture > 100 ||
    plant.minMoisture >= plant.optimalMoisture || plant.optimalMoisture >= plant.maxMoisture) {
    return "Sensor Error";
  }
  if (plant.readingSource === "sensor" || plant.readingSource === "simulation") {
    const readingTime = plant.readingTimestamp ? new Date(plant.readingTimestamp).getTime() : Number.NaN;
    if (!Number.isFinite(readingTime) || readingTime > now || now - readingTime > 24 * 60 * 60 * 1000) {
      return "Sensor Error";
    }
  }
  if (plant.moisture < plant.minMoisture) return "Needs Water";
  if (plant.moisture > plant.maxMoisture) return "Too Wet";
  return "Healthy";
}

export function createPlant(configuration: PlantConfiguration): Plant {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `plant-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const plant: Plant = {
    id,
    name: configuration.name.trim(),
    species: configuration.species.trim(),
    category: configuration.species.trim(),
    moisture: null,
    temperature: null,
    humidity: null,
    tankLevel: null,
    nextWatering: configuration.wateringSchedule.trim() || "Not scheduled",
    status: "Sensor Error",
    threshold: configuration.minMoisture,
    image: configuration.image,
    active: true,
    readingSource: "unavailable",
    readingTimestamp: null,
    minMoisture: configuration.minMoisture,
    optimalMoisture: configuration.optimalMoisture,
    maxMoisture: configuration.maxMoisture,
    waterVolumeMl: configuration.waterVolumeMl,
    maxCyclesPerDay: configuration.maxCyclesPerDay,
    maxPumpRuntimeSeconds: configuration.maxPumpRuntimeSeconds,
    wateringSchedule: configuration.wateringSchedule.trim(),
    lastWateredAt: null,
    moistureHistory: [],
    wateringHistory: [],
    growth: null,
    growthHistory: [],
    predictions: [],
    isDemoData: false,
  };
  return { ...plant, status: getPlantStatus(plant, Date.now()) };
}

export function withCurrentStatus(plant: Plant): Plant {
  return { ...plant, status: getPlantStatus(plant, Date.now()) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMoistureHistory(value: unknown): value is Plant["moistureHistory"] {
  return Array.isArray(value) && value.every((point) =>
    isRecord(point) && typeof point.recordedAt === "string" && typeof point.moisture === "number" &&
    Number.isFinite(point.moisture) && point.moisture >= 0 && point.moisture <= 100
  );
}

function isWateringHistory(value: unknown): value is Plant["wateringHistory"] {
  return Array.isArray(value) && value.every((event) =>
    isRecord(event) && typeof event.id === "string" && typeof event.date === "string" &&
    typeof event.volumeMl === "number" && Number.isFinite(event.volumeMl) &&
    typeof event.durationSeconds === "number" && Number.isFinite(event.durationSeconds) &&
    typeof event.strategy === "string" && typeof event.reason === "string" &&
    (event.outcome === "Completed" || event.outcome === "Skipped" || event.outcome === "Failed")
  );
}

function isGrowthHistory(value: unknown): value is GrowthPoint[] {
  return Array.isArray(value) && value.every((point) => isRecord(point) &&
    typeof point.recordedAt === "string" &&
    (point.heightCm === undefined || (typeof point.heightCm === "number" && Number.isFinite(point.heightCm))) &&
    (point.leafCount === undefined || (typeof point.leafCount === "number" && Number.isFinite(point.leafCount))) &&
    (point.biomassGrams === undefined || (typeof point.biomassGrams === "number" && Number.isFinite(point.biomassGrams)))
  );
}

function isPredictionHistory(value: unknown): value is Plant["predictions"] {
  return Array.isArray(value) && value.every((prediction) =>
    isRecord(prediction) &&
    typeof prediction.madeAt === "string" &&
    typeof prediction.targetTime === "string" &&
    typeof prediction.predictedMoisture === "number" &&
    Number.isFinite(prediction.predictedMoisture) &&
    (prediction.actualMoisture === null ||
      (typeof prediction.actualMoisture === "number" && Number.isFinite(prediction.actualMoisture))) &&
    typeof prediction.modelName === "string" &&
    typeof prediction.algorithm === "string"
  );
}

export function isPlant(value: unknown): value is Plant {
  if (!isRecord(value)) return false;
  const optionalReading = (reading: unknown) => reading === null || (typeof reading === "number" && Number.isFinite(reading));
  return typeof value.id === "string" && typeof value.name === "string" &&
    typeof value.species === "string" && typeof value.category === "string" &&
    (typeof value.image === "string" || value.image === null) &&
    optionalReading(value.moisture) && optionalReading(value.temperature) && optionalReading(value.humidity) &&
    typeof value.active === "boolean" &&
    (value.readingSource === "sensor" || value.readingSource === "simulation" || value.readingSource === "demo" || value.readingSource === "unavailable") &&
    (typeof value.readingTimestamp === "string" || value.readingTimestamp === null) &&
    ["minMoisture", "optimalMoisture", "maxMoisture", "waterVolumeMl", "maxCyclesPerDay", "maxPumpRuntimeSeconds"].every(
      (key) => typeof value[key] === "number" && Number.isFinite(value[key])
    ) &&
    typeof value.wateringSchedule === "string" && typeof value.nextWatering === "string" &&
    typeof value.threshold === "number" && optionalReading(value.tankLevel) &&
    (typeof value.lastWateredAt === "string" || value.lastWateredAt === null) &&
    isMoistureHistory(value.moistureHistory) && isWateringHistory(value.wateringHistory) && isGrowthHistory(value.growthHistory) &&
    (value.predictions === undefined || isPredictionHistory(value.predictions)) &&
    (value.growth === null || isRecord(value.growth)) && typeof value.isDemoData === "boolean" &&
    (value.status === "Healthy" || value.status === "Needs Water" || value.status === "Too Wet" || value.status === "Sensor Error" || value.status === "Inactive");
}

export function readPlants(value: unknown): Plant[] | null {
  if (!Array.isArray(value)) return null;
  const normalized = value.map((plant) =>
    isRecord(plant)
      ? {
          predictions: [],
          growthHistory: [],
          ...plant,
        }
      : plant
  );
  if (!normalized.every(isPlant)) return null;
  return normalized.map(withCurrentStatus);
}

export function statusClass(status: PlantStatus): string {
  return status.toLowerCase().replaceAll(" ", "-");
}

export function readingSourceLabel(source: ReadingSource): string {
  if (source === "simulation") return "Simulated reading";
  if (source === "demo") return "Demonstration reading";
  if (source === "sensor") return "Sensor reading";
  return "No sensor reading";
}
