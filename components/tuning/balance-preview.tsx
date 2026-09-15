"use client"
import dynamic from "next/dynamic"
import { useRef, useState } from "react"
import { createTown, TOWN_SETTINGS } from "@/lib/path-lab/town"
import type { TownPlayback } from "../path-lab/town-scene"
const TownScene = dynamic(() => import("../path-lab/town-scene").then(module => module.TownScene), { ssr:false })
/** Existing village scene provides context for the global rule editor.
 * @see https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/C2E-0
 */
export function BalancePreview({ active }: { active: boolean }) {
  const [town] = useState(createTown)
  const live = useRef<TownPlayback>({ playing:false, speed:1, settings:TOWN_SETTINGS })
  const labels = useRef(new Map<string,HTMLButtonElement>())
  return <div className="person-stage" style={{ height:"100%",border:0 }}>{active && <TownScene town={town} live={live} labels={labels} view={0} focus={null} selected={null} onSelect={() => {}} onReady={() => {}} />}</div>
}
