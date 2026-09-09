import type { Metadata } from "next"
import { cookies } from "next/headers"

import { GameShell } from "@/components/game/game-shell"
import { RESUME_COOKIE, resumeCookieSeed } from "@/lib/game/save/storage"

export const metadata: Metadata = {
  title: "Pilgrimage",
  description: "A medieval settlement builder.",
}

/** The landing page: choose a seed and size for a new world, or continue the saved one at /play. */
export default async function LandingPage() {
  return <GameShell mode="landing" expectResume={resumeCookieSeed((await cookies()).get(RESUME_COOKIE)?.value) !== null} />
}
