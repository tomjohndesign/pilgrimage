import type { Metadata } from "next"
import { RenderLab } from "@/components/render-lab/render-lab"

export const metadata: Metadata = {
  title: "Pilgrimage — Pixel workshop",
  description: "Compare pixel rendering methods with synchronized characters and scenery.",
}

export default function RenderingPage() {
  return <RenderLab />
}
