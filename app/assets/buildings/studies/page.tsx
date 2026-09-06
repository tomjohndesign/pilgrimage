import type { Metadata } from "next"
import { BuildingLab } from "@/components/building-lab/building-lab"

export const metadata: Metadata = {
  title: "Pilgrimage — Illustrated building studies",
  description: "Illustrated material references and earlier building image experiments.",
}

export default function BuildingStudiesPage() { return <BuildingLab /> }
