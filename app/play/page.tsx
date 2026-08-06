import type { Metadata } from "next"

import { GameShell } from "@/components/game/game-shell"

export const metadata: Metadata = {
  title: "Pilgrimage — Prototype",
  description: "Isometric camera and map prototype for Pilgrimage.",
}

export default function PlayPage() {
  return <GameShell />
}
