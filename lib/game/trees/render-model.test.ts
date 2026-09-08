import { describe, expect, it } from "vitest"
import { DEFAULT_TREE_MODEL, treeModelForGame } from "./render-model"

describe("game tree renderer", () => {
  it("uses sprites for defaults and old procedural bookmarks in ordinary builds", () => {
    expect(DEFAULT_TREE_MODEL).toBe("sprites")
    for (const value of [undefined, "sprites", "procedural", "unknown"]) expect(treeModelForGame(value, false)).toBe("sprites")
  })
  it("allows the procedural comparison only in an explicitly enabled benchmark build", () => {
    expect(treeModelForGame("procedural", true)).toBe("procedural")
    expect(treeModelForGame(undefined, true)).toBe("sprites")
  })
})
