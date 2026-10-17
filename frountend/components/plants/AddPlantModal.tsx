"use client";

import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { ModalFrame } from "@/components/shared/ModalFrame";
import type { Plant } from "@/lib/types";

interface AddPlantModalProps {
  onClose: () => void;
  onAdd: (plant: Plant) => void;
}

export function AddPlantModal({ onClose, onAdd }: AddPlantModalProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [threshold, setThreshold] = useState("35");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanCategory = category.trim();
    if (!cleanName || !cleanCategory) return;

    onAdd({
      id: `${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
      name: cleanName,
      category: cleanCategory,
      moisture: 50,
      temperature: 22,
      tankLevel: 68,
      nextWatering: "Not scheduled",
      status: "Healthy",
      threshold: Number(threshold),
      image:
        "https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=180&q=80",
    });
    onClose();
  }

  return (
    <ModalFrame labelledBy="add-plant-title" onClose={onClose}>
        <div className="modal-heading">
          <div><span className="eyebrow">YOUR GARDEN</span><h2 id="add-plant-title">Add a new plant</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button>
        </div>
        <form onSubmit={submit}>
          <label className="form-field">Plant name<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Peace Lily" /></label>
          <label className="form-field">Category<input required value={category} onChange={(event) => setCategory(event.target.value)} placeholder="e.g. Indoor" /></label>
          <label className="form-field">Moisture threshold <span className="input-with-suffix"><input type="number" min="1" max="100" required value={threshold} onChange={(event) => setThreshold(event.target.value)} /><span>%</span></span></label>
          <p className="form-note">This plant will be added to this dashboard session only.</p>
          <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button type="submit" className="button primary">Add plant</button></div>
        </form>
    </ModalFrame>
  );
}
