"use client";

import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { ModalFrame } from "@/components/shared/ModalFrame";
import { createPlant, type PlantConfiguration } from "@/lib/plants";
import type { Plant } from "@/lib/types";

interface AddPlantModalProps {
  onClose: () => void;
  onSave: (plant: Plant) => Promise<void>;
  plant?: Plant;
}

const defaultConfiguration: PlantConfiguration = {
  name: "",
  species: "",
  image: null,
  minMoisture: 30,
  optimalMoisture: 50,
  maxMoisture: 70,
  waterVolumeMl: 250,
  maxCyclesPerDay: 2,
  maxPumpRuntimeSeconds: 30,
  wateringSchedule: "",
};

export function AddPlantModal({ onClose, onSave, plant }: AddPlantModalProps) {
  const [values, setValues] = useState<PlantConfiguration>(() => plant ? {
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
  } : defaultConfiguration);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  function update<K extends keyof PlantConfiguration>(key: K, value: PlantConfiguration[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (values.minMoisture >= values.optimalMoisture || values.optimalMoisture >= values.maxMoisture) {
      setError("Moisture thresholds must be ordered: minimum < optimal < maximum.");
      return;
    }
    const configuration = { ...values, image: values.image?.trim() || null };
    setIsSaving(true);
    try {
      if (plant) {
        await onSave({
          ...plant,
          ...configuration,
          category: configuration.species,
          threshold: configuration.minMoisture,
          nextWatering: configuration.wateringSchedule.trim() || "Not scheduled",
        });
      } else {
        await onSave(createPlant(configuration));
      }
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Plant changes could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ModalFrame labelledBy="plant-form-title" onClose={onClose}>
      <div className="modal-heading">
        <div><span className="eyebrow">YOUR GARDEN</span><h2 id="plant-form-title">{plant ? "Edit plant" : "Add a new plant"}</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button>
      </div>
      <form onSubmit={submit}>
        <div className="plant-form-grid">
          <label className="form-field">Plant name
            <input autoFocus required maxLength={60} value={values.name} onChange={(event) => update("name", event.target.value)} placeholder="e.g. Peace Lily" />
          </label>
          <label className="form-field">Plant species
            <input required maxLength={80} value={values.species} onChange={(event) => update("species", event.target.value)} placeholder="e.g. Spathiphyllum wallisii" />
          </label>
          <label className="form-field plant-form-wide">Image URL <span className="form-optional">Not saved by the backend</span>
            <input type="url" value={values.image ?? ""} onChange={(event) => update("image", event.target.value)} placeholder="https://example.com/plant.jpg" />
          </label>
          <label className="form-field">Minimum moisture
            <span className="input-with-suffix"><input type="number" min="0" max="99" step="1" required value={values.minMoisture} onChange={(event) => update("minMoisture", Number(event.target.value))} /><span>%</span></span>
          </label>
          <label className="form-field">Optimal moisture
            <span className="input-with-suffix"><input type="number" min="1" max="100" step="1" required value={values.optimalMoisture} onChange={(event) => update("optimalMoisture", Number(event.target.value))} /><span>%</span></span>
          </label>
          <label className="form-field">Maximum moisture
            <span className="input-with-suffix"><input type="number" min="2" max="100" step="1" required value={values.maxMoisture} onChange={(event) => update("maxMoisture", Number(event.target.value))} /><span>%</span></span>
          </label>
          <label className="form-field">Water per cycle
            <span className="input-with-suffix"><input type="number" min="1" max="5000" step="1" required value={values.waterVolumeMl} onChange={(event) => update("waterVolumeMl", Number(event.target.value))} /><span>mL</span></span>
          </label>
          <label className="form-field">Maximum cycles per day
            <input type="number" min="1" max="24" step="1" required value={values.maxCyclesPerDay} onChange={(event) => update("maxCyclesPerDay", Number(event.target.value))} />
          </label>
          <label className="form-field">Maximum pump runtime
            <span className="input-with-suffix"><input type="number" min="1" max="600" step="1" required value={values.maxPumpRuntimeSeconds} onChange={(event) => update("maxPumpRuntimeSeconds", Number(event.target.value))} /><span>sec</span></span>
          </label>
          <label className="form-field plant-form-wide">Daily watering time <span className="form-optional">Optional</span>
            <input type="time" value={values.wateringSchedule} onChange={(event) => update("wateringSchedule", event.target.value)} />
          </label>
        </div>
        <p className="form-note">These are starter values only. Set moisture and watering limits for this plant’s species and growing conditions. The backend stores a daily schedule time only. New plants start without sensor readings.</p>
        {error && <p className="settings-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose} disabled={isSaving}>Cancel</button><button type="submit" className="button primary" disabled={isSaving}>{isSaving ? "Saving…" : plant ? "Save changes" : "Add plant"}</button></div>
      </form>
    </ModalFrame>
  );
}
