import type { Metadata } from "next"
import { PathLab } from "@/components/path-lab/path-lab"

export const metadata: Metadata = {
  title: "Pilgrimage — Path playgrounds",
  description: "Explore shared routes, traffic-worn paths, regrowth, and settlement frontage.",
}

export default function PathsPage() { return <PathLab /> }
