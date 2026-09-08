import { expect, it } from "vitest"
import { buildBridgePieces, bridgeDetailPieces } from "./bridge-pieces"
import { parseAsciiMap } from "../map/prototype-map"

it("simplifies timber and stone bridges while retaining every deck, ramp and corner depth surface", () => {
  const maps = [
    [".......", "..~~~..", "==###==", "..~~~..", "......."],
    ["..=....", "..#~~..", "..###==", "..~~~..", "......."],
    ["==############=="],
  ]
  for (const ascii of maps) for (const tier of [0, 2, 3]) {
    const full = buildBridgePieces(parseAsciiMap(ascii), tier), coarse = bridgeDetailPieces(full)
    expect(full.silhouettes.length).toBeGreaterThan(0)
    expect(coarse.silhouettes).toBe(full.silhouettes)
    expect(coarse.boxes.slice(0, full.silhouettes.length)).toEqual(full.silhouettes)
    expect(coarse.boxes.length + coarse.posts.length).toBeLessThan(full.boxes.length + full.posts.length)
    for (const support of coarse.posts) {
      expect(full.posts).toContain(support)
      expect(support.sx).toBeGreaterThanOrEqual(.045)
    }
  }
})
