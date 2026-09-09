import { expect, it } from "vitest"
import { WILDLIFE_COATS, wildlifeAppearance } from "./appearance"

it("reproduces coats by world and animal identity, independent of herd order", () => {
  const ids=Array.from({length:40},(_,i)=>i), coats=ids.map(id=>wildlifeAppearance(917,id))
  expect([...ids].reverse().map(id=>wildlifeAppearance(917,id)).reverse()).toEqual(coats)
  expect(new Set(coats.map(coat=>coat.id)).size).toBe(WILDLIFE_COATS.length)
  expect(ids.map(id=>wildlifeAppearance(123,id))).not.toEqual(coats)
})
