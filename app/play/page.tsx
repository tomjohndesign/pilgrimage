import type { Metadata } from "next"
import { cookies } from "next/headers"

import { GameShell } from "@/components/game/game-shell"
import { RESUME_COOKIE, resumeCookieSeed } from "@/lib/game/save/storage"
import { parsePlayQuery } from "@/lib/game/save/url"

export const metadata: Metadata = {
  title: "Pilgrimage — Prototype",
  description: "Isometric camera and map prototype for Pilgrimage.",
}

export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const query = parsePlayQuery(await searchParams)
  // /play is always the game: the saved world when the browser has one, else a new one.
  // The cookie names the saved seed, so a link to another seed opens as a fresh world.
  const savedSeed = resumeCookieSeed((await cookies()).get(RESUME_COOKIE)?.value)
  const expectResume = savedSeed !== null && (query.seed === undefined || (query.seed >>> 0) === savedSeed)
  return <GameShell
    mode="play"
    expectResume={expectResume}
    benchmarkCity={process.env.NEXT_PUBLIC_GAME_BENCHMARK === "1" && (query.benchmark ?? false)}
    initialSeed={query.seed}
    initialWorld={query.world}
    initialDisplay={query.display} />
}
