import type { Metadata } from "next"

import { BasePersonLab } from "@/components/base-person-lab"

export const metadata: Metadata = {
  title: "Pilgrimage — Characters",
  description: "A tiny, consistent base person for every calling on the road.",
}

export default function CharactersPage() {
  return <main><BasePersonLab /></main>
}
