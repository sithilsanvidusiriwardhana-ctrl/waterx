"use client";

import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  apiErrorMessage,
  createPlant as createBackendPlant,
  deletePlant as deleteBackendPlant,
  getPlants,
  updatePlant as updateBackendPlant,
  type PlantInput,
} from "@/lib/api";
import { withCurrentStatus } from "@/lib/plants";
import type { Plant } from "@/lib/types";

interface PlantsContextValue {
  plants: Plant[];
  isLoading: boolean;
  apiError: string;
  refreshPlants: () => Promise<void>;
  addPlant: (plant: Plant) => Promise<void>;
  updatePlant: (id: string, updates: Partial<Plant>) => Promise<void>;
  togglePlantActive: (id: string) => Promise<void>;
  deletePlant: (id: string) => Promise<void>;
  clearApiError: () => void;
}

const PlantsContext = createContext<PlantsContextValue | null>(null);

function plantInput(plant: Plant): PlantInput {
  return {
    name: plant.name,
    species: plant.species,
    minMoisture: plant.minMoisture,
    optimalMoisture: plant.optimalMoisture,
    maxMoisture: plant.maxMoisture,
    waterVolumeMl: plant.waterVolumeMl,
    maxCyclesPerDay: plant.maxCyclesPerDay,
    maxPumpRuntimeSeconds: plant.maxPumpRuntimeSeconds,
    wateringSchedule: plant.wateringSchedule,
  };
}

export function PlantsProvider({ children }: { children: ReactNode }) {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState("");

  const refreshPlants = useCallback(async () => {
    setIsLoading(true);
    try {
      const savedPlants = await getPlants();
      startTransition(() => {
        setPlants(savedPlants.map(withCurrentStatus));
        setApiError("");
      });
    } catch (error) {
      startTransition(() => setApiError(apiErrorMessage(error)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const mutate = useCallback(async (operation: () => Promise<unknown>) => {
    setApiError("");
    try {
      await operation();
    } catch (error) {
      const message = apiErrorMessage(error);
      setApiError(message);
      throw error;
    }
    await refreshPlants();
  }, [refreshPlants]);

  useEffect(() => {
    void refreshPlants();
    const timer = window.setInterval(() => {
      setPlants((current) => current.map(withCurrentStatus));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [refreshPlants]);

  const value = useMemo<PlantsContextValue>(() => ({
    plants,
    isLoading,
    apiError,
    refreshPlants,
    addPlant: (plant) => mutate(() => createBackendPlant(plantInput(plant))),
    updatePlant: (id, updates) => {
      const current = plants.find((plant) => plant.id === id);
      if (!current) return Promise.reject(new Error("Plant not found."));
      return mutate(() => updateBackendPlant(id, plantInput({ ...current, ...updates })));
    },
    togglePlantActive: (id) => {
      const plant = plants.find((item) => item.id === id);
      if (!plant) return Promise.reject(new Error("Plant not found."));
      return mutate(() => updateBackendPlant(id, { active: !plant.active }));
    },
    deletePlant: (id) => mutate(() => deleteBackendPlant(id)),
    clearApiError: () => setApiError(""),
  }), [apiError, isLoading, mutate, plants, refreshPlants]);

  return <PlantsContext.Provider value={value}>{children}</PlantsContext.Provider>;
}

export function usePlants() {
  const context = useContext(PlantsContext);
  if (!context) throw new Error("usePlants must be used within PlantsProvider");
  return context;
}
