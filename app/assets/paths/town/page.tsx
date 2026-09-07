import type { Metadata } from "next"
import { TownLab } from "@/components/path-lab/town-lab"
export const metadata: Metadata = { title: "Pilgrimage — A village finds its paths", description: "A staged village with working residents and roads emerging from daily journeys." }
export default function TownPathsPage() { return <TownLab /> }
