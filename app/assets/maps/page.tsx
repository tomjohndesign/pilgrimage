import type { Metadata } from "next"
import { MapLab } from "@/components/map-lab/map-lab"

export const metadata: Metadata = {
  title: "Pilgrimage — Map playground",
  description: "Explore wind-spread and cellular woodland seeding, open meadows and connected clearings.",
}

export default function MapsPage() { return <MapLab /> }
