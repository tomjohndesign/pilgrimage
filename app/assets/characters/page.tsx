import type { Metadata } from "next"
import { Suspense } from "react"
import { AssetPlayground } from "@/components/asset-playground"

export const metadata: Metadata = {
  title: "Pilgrimage — Asset playground",
  description: "Characters, animals and procedural buildings in one shared playground.",
}

export default function CharactersPage() {
  return <main><Suspense fallback={<p>Loading asset playground…</p>}><AssetPlayground /></Suspense></main>
}
