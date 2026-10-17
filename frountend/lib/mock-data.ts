import type { MoistureReading, NotificationItem, Plant, WateringEvent } from "@/lib/types";

export const dashboardMetrics = {
  tankLevelPercent: 68,
  tankCapacityLiters: 10,
  tankUsedLiters: 3.2,
  weeklyWaterUsedLiters: 12.4,
  weeklyWaterChangePercent: 8,
  predictionAccuracyPercent: 92.5,
  meanAbsoluteError: 0.042,
  tankWarningThresholdPercent: 70,
} as const;

export const plants: Plant[] = [
  {
    id: "basil",
    name: "Basil",
    category: "Herb",
    moisture: 62,
    temperature: 24,
    tankLevel: dashboardMetrics.tankLevelPercent,
    nextWatering: "Apr 27, 2025 · 04:00 PM",
    status: "Healthy",
    threshold: 35,
    image:
      "https://images.unsplash.com/photo-1618164436241-4473940d1f5c?auto=format&fit=crop&w=180&q=80",
  },
  {
    id: "tomato",
    name: "Tomato",
    category: "Vegetable",
    moisture: 32,
    temperature: 26,
    tankLevel: dashboardMetrics.tankLevelPercent,
    nextWatering: "Apr 27, 2025 · 06:00 PM",
    status: "Needs Water",
    threshold: 38,
    image:
      "https://images.unsplash.com/photo-1592841200221-a6898f307baa?auto=format&fit=crop&w=180&q=80",
  },
  {
    id: "spider-plant",
    name: "Spider Plant",
    category: "Indoor",
    moisture: 58,
    temperature: 22,
    tankLevel: dashboardMetrics.tankLevelPercent,
    nextWatering: "Apr 28, 2025 · 08:00 AM",
    status: "Healthy",
    threshold: 30,
    image:
      "https://images.unsplash.com/photo-1572688484438-313a6e50c333?auto=format&fit=crop&w=180&q=80",
  },
  {
    id: "succulent",
    name: "Succulent",
    category: "Indoor",
    moisture: 76,
    temperature: 21,
    tankLevel: dashboardMetrics.tankLevelPercent,
    nextWatering: "Apr 30, 2025 · 09:00 AM",
    status: "Moist",
    threshold: 25,
    image:
      "https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?auto=format&fit=crop&w=180&q=80",
  },
];

export const moistureReadings: MoistureReading[] = [
  { day: "Apr 21", basil: 60, tomato: 48, spiderPlant: 44, succulent: 36 },
  { day: "Apr 22", basil: 63, tomato: 40, spiderPlant: 52, succulent: 24 },
  { day: "Apr 23", basil: 60, tomato: 46, spiderPlant: 48, succulent: 22 },
  { day: "Apr 24", basil: 67, tomato: 34, spiderPlant: 40, succulent: 26 },
  { day: "Apr 25", basil: 61, tomato: 40, spiderPlant: 43, succulent: 22 },
  { day: "Apr 26", basil: 69, tomato: 36, spiderPlant: 35, succulent: 30 },
  { day: "Apr 27", basil: 62, tomato: 32, spiderPlant: 39, succulent: 26 },
];

export const predictionReadings = [
  { time: "Now", observed: 32, predicted: 32, lower: 26, upper: 38 },
  { time: "+1h", observed: 37, predicted: 36, lower: 30, upper: 42 },
  { time: "+2h", observed: 43, predicted: 40, lower: 33, upper: 47 },
  { time: "+3h", observed: 41, predicted: 36, lower: 28, upper: 44 },
  { time: "+4h", observed: 39, predicted: 34, lower: 25, upper: 43 },
  { time: "+5h", observed: 33, predicted: 31, lower: 22, upper: 40 },
  { time: "+6h", observed: 29, predicted: 28, lower: 18, upper: 38 },
];

export const notifications: NotificationItem[] = [
  {
    id: "low-water",
    title: "Low Water Level",
    description: `Tank level is below the configured warning threshold (${dashboardMetrics.tankWarningThresholdPercent}%). Current level: ${dashboardMetrics.tankLevelPercent}%.`,
    time: "10:12 AM",
    tone: "warning",
  },
  {
    id: "watered-basil",
    title: "Watering Completed",
    description: "Basil was watered successfully.",
    time: "08:45 AM",
    tone: "info",
  },
  {
    id: "tomato-forecast",
    title: "AI Prediction Available",
    description: "Soil moisture forecast for Tomato (next 6 hours).",
    time: "07:30 AM",
    tone: "success",
  },
  {
    id: "wet-soil",
    title: "Soil Too Wet",
    description: "Succulent soil moisture is high (76%). Watering skipped.",
    time: "06:15 AM",
    tone: "danger",
  },
];

export const wateringEvents: WateringEvent[] = [
  { id: "event-basil", plant: "Basil", result: "Watered", detail: "Watered for 2 min (0.4 L)", time: "Apr 27, 08:45 AM" },
  { id: "event-tomato", plant: "Tomato", result: "Skipped", detail: "Schedule was not met", time: "Apr 27, 06:20 AM" },
  { id: "event-spider", plant: "Spider Plant", result: "Watered", detail: "Watered for 3 min (0.5 L)", time: "Apr 26, 09:12 AM" },
  { id: "event-succulent", plant: "Succulent", result: "Skipped", detail: "Soil moisture was high", time: "Apr 26, 05:05 AM" },
];
