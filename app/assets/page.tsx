import type { Metadata } from "next"
import { Suspense } from "react"
import { AssetPlayground } from "@/components/asset-playground"

export const metadata: Metadata = {
  title: "Pilgrimage — Playground",
  description: "Edit assets and inspect maps, paths, placement and rendering in one shared playground.",
}

export default function PlaygroundPage() {
  return <main><Suspense fallback={<p>Loading playground…</p>}><AssetPlayground /></Suspense></main>
}
