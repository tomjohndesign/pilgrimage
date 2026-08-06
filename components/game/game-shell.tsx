"use client"

import dynamic from "next/dynamic"

import { GameHud } from "./game-hud"

/**
 * WebGL has no meaningful server render, and three.js touches browser globals on
 * import, so the canvas is client-only. The HUD is plain DOM and renders normally.
 */
const GameCanvas = dynamic(() => import("./game-canvas").then((m) => m.GameCanvas), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <span className="font-display text-[10px] uppercase tracking-[3px] text-gold">
        Surveying the land…
      </span>
    </div>
  ),
})

export function GameShell() {
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#14100a] select-none">
      <GameCanvas />
      <GameHud />
    </div>
  )
}
