import type { Metadata } from "next"
import { cookies } from "next/headers"

import { GameShell } from "@/components/game/game-shell"
import { parseResumeCookie, RESUME_COOKIE } from "@/lib/game/save/storage"
import { parsePlayQuery } from "@/lib/game/save/url"
import { resumeViewScript } from "@/lib/game/save/view"

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
  const saved = parseResumeCookie((await cookies()).get(RESUME_COOKIE)?.value)
  const expectResume = saved !== null && (query.seed === undefined || (query.seed >>> 0) === saved.seed)
  return <>
    {/* Paints the remembered land from browser storage while the HTML is still
        parsing, so a resumed world shows its last view before any game code runs. */}
    {expectResume && <script dangerouslySetInnerHTML={{ __html: resumeViewScript(saved.seed) }} />}
    <GameShell
      mode="play"
      expectResume={expectResume}
      resumeViewSize={expectResume ? saved.viewSize : null}
      benchmarkCity={process.env.NEXT_PUBLIC_GAME_BENCHMARK === "1" && (query.benchmark ?? false)}
      lab={query.lab ?? false}
      initialSeed={query.seed}
      initialWorld={query.world}
      initialDisplay={query.display} />
  </>
}
