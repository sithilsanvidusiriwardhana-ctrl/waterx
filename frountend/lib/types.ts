export type PlantStatus = "Healthy" | "Needs Water" | "Moist";

export interface Plant {
  id: string;
  name: string;
  category: string;
  moisture: number;
  temperature: number;
  tankLevel: number;
  nextWatering: string;
  status: PlantStatus;
  threshold: number;
  image: string;
}

export interface MoistureReading {
  day: string;
  basil: number;
  tomato: number;
  spiderPlant: number;
  succulent: number;
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
