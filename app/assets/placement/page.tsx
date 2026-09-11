import type { Metadata } from "next"
import { PlacementLab } from "@/components/placement-lab/placement-lab"

export const metadata: Metadata = {
  title: "Pilgrimage — Placement playground",
  description: "Place buildings on hillsides and watch the ground level under them, within the tuned limit.",
}

export default function PlacementPage() { return <PlacementLab /> }
