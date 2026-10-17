import type { Plant } from "@/lib/types";

const API_BASE_URL = (process.env.NEXT_PUBLIC_WATERX_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

export interface DashboardAlert {
  id: string;
  plant: string | null;
  type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  time: string;
  simulated: boolean;
}

export interface DashboardPrediction {
  id: string;
  plantId: string;
  plant: string;
  madeAt: string;
  targetTime: string;
  predictedMoisture: number;
  actualMoisture: number | null;
  modelName: string;
  algorithm: string;
  simulated: boolean;
}

export interface DashboardSnapshot {
  plants: Plant[];
  tank: {
    levelMl: number;
    capacityMl: number;
    levelPercent: number;
    recordedAt: string;
  } | null;
  weeklyWaterUsedMl: number;
  soilMoisture: Array<{ day: string; values: Record<string, number> }>;
  events: Array<{
    id: string;
    plant: string;
    result: "Watered";
    detail: string;
    time: string;
    simulated: boolean;
  }>;
  alerts: DashboardAlert[];
  predictions: DashboardPrediction[];
  predictionMae: number | null;
  predictionCount: number;
  latestSimulation: { strategy: string; createdAt: string } | null;
}

export type PlantInput = Pick<
  Plant,
  | "name"
  | "species"
  | "minMoisture"
  | "optimalMoisture"
  | "maxMoisture"
  | "waterVolumeMl"
  | "maxCyclesPerDay"
  | "maxPumpRuntimeSeconds"
  | "wateringSchedule"
>;

export class ApiError extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(`Cannot reach the WaterX backend at ${API_BASE_URL}. Check that it is running.`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError(
      response.ok ? "The WaterX backend returned an invalid JSON response." : `Backend request failed (${response.status}).`,
      response.status,
    );
  }

  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
      ? body.error
      : `Backend request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return body as T;
}

export function getPlants(): Promise<Plant[]> {
  return request<Plant[]>("/api/plants");
}

export function getPlant(id: string): Promise<Plant> {
  return request<Plant>(`/api/plants/${encodeURIComponent(id)}`);
}

export function getDashboard(): Promise<DashboardSnapshot> {
  return request<DashboardSnapshot>("/api/dashboard");
}

export function createPlant(input: PlantInput): Promise<Plant> {
  return request<Plant>("/api/plants", { method: "POST", body: JSON.stringify(input) });
}

export function updatePlant(id: string, input: Partial<PlantInput> & { active?: boolean }): Promise<Plant> {
  return request<Plant>(`/api/plants/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deletePlant(id: string): Promise<{ deleted: boolean; id: string }> {
  return request<{ deleted: boolean; id: string }>(`/api/plants/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function apiErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected backend error occurred.";
}
