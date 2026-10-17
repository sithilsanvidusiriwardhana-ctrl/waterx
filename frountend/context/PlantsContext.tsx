"use client";

import { createContext, startTransition, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { plants as demoPlants } from "@/lib/mock-data";
import { PLANTS_STORAGE_KEY, readPlants, withCurrentStatus } from "@/lib/plants";
import type { Plant } from "@/lib/types";

interface PlantsContextValue {
  plants: Plant[];
  isLoading: boolean;
  storageError: string;
  addPlant: (plant: Plant) => void;
  updatePlant: (id: string, updates: Partial<Plant>) => void;
  togglePlantActive: (id: string) => void;
  deletePlant: (id: string) => void;
  clearStorageError: () => void;
}

const PlantsContext = createContext<PlantsContextValue | null>(null);

export function PlantsProvider({ children }: { children: ReactNode }) {
  const [plants, setPlants] = useState<Plant[]>(demoPlants);
  const [isHydrated, setIsHydrated] = useState(false);
  const [storageError, setStorageError] = useState("");

  useEffect(() => {
    let loadedPlants: Plant[] | null = null;
    let loadError = "";
    try {
      const stored = window.localStorage.getItem(PLANTS_STORAGE_KEY);
      if (stored !== null) {
        const parsed: unknown = JSON.parse(stored);
        loadedPlants = readPlants(parsed);
        if (!loadedPlants) loadError = "Saved plant data is invalid. The demonstration plants are shown instead.";
      }
    } catch {
      loadError = "Plant data could not be read from local storage.";
    }
    startTransition(() => {
      if (loadedPlants) setPlants(loadedPlants);
      if (loadError) setStorageError(loadError);
      setIsHydrated(true);
    });
  }, []);

  function save(nextPlants: Plant[]) {
    const updated = nextPlants.map(withCurrentStatus);
    setPlants(updated);
    setStorageError("");
    try {
      window.localStorage.setItem(PLANTS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      setStorageError("Plant changes are visible for this session but could not be saved to local storage.");
    }
  }

  useEffect(() => {
    if (!isHydrated) return;
    const refreshStatuses = () => {
      setPlants((current) => current.map(withCurrentStatus));
    };
    const timer = window.setInterval(refreshStatuses, 60_000);
    return () => window.clearInterval(timer);
  }, [isHydrated]);

  const value = useMemo<PlantsContextValue>(() => ({
    plants,
    isLoading: !isHydrated,
    storageError,
    addPlant: (plant) => save([...plants, plant]),
    updatePlant: (id, updates) => save(plants.map((plant) =>
      plant.id === id ? withCurrentStatus({ ...plant, ...updates }) : plant
    )),
    togglePlantActive: (id) => save(plants.map((plant) =>
      plant.id === id ? { ...plant, active: !plant.active } : plant
    )),
    deletePlant: (id) => save(plants.filter((plant) => plant.id !== id)),
    clearStorageError: () => setStorageError(""),
  }), [isHydrated, plants, storageError]);

  return <PlantsContext.Provider value={value}>{children}</PlantsContext.Provider>;
}

export function usePlants() {
  const context = useContext(PlantsContext);
  if (!context) throw new Error("usePlants must be used within PlantsProvider");
  return context;
}
