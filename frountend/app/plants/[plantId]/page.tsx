"use client";

import { useParams } from "next/navigation";
import { PlantDetailsPage } from "@/components/plants/PlantDetailsPage";

export default function PlantDetailsRoute() {
  const params = useParams<{ plantId: string }>();
  return <PlantDetailsPage plantId={params.plantId} />;
}
