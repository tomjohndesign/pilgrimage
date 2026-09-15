import { describe, expect, it } from "vitest"
import { legacyPlaygroundHref, playgroundHref, playgroundTool } from "./asset-playground"

describe("shared playground navigation", () => {
  it("opens old map links in the playground without losing settings", () => {
    expect(legacyPlaygroundHref({ seed: "123", forest: "35", overlay: "0" }, "maps"))
      .toBe("/assets?seed=123&forest=35&overlay=0&asset=maps")
  })
  it("keeps tuning and resource bookmarks in the same workspace", () => {
    expect(legacyPlaygroundHref({}, "tuning")).toBe("/assets?asset=tuning")
    expect(legacyPlaygroundHref({ clip: "walk" }, "pipeline")).toBe("/assets?clip=walk&asset=pipeline")
    expect(playgroundTool("trees")).toBe("trees")
    expect(playgroundTool("textures")).toBe("textures")
  })
  it("preserves character deep links and repeated parameters", () => {
    expect(legacyPlaygroundHref({ asset: "horse", sounds: "1", tag: ["one", "two"] }))
      .toBe("/assets?asset=horse&sounds=1&tag=one&tag=two")
  })
  it("keeps a tool's query intact when building its canonical link", () => {
    const params = new URLSearchParams("asset=paths&seed=4294967295&experiment=wear")
    expect(playgroundHref("paths", params)).toBe("/assets?asset=paths&seed=4294967295&experiment=wear")
    playgroundHref("maps", params)
    expect(params.get("asset")).toBe("paths")
  })
  it("supports old animal selections and defaults unknown modes to characters", () => {
    expect(playgroundTool("horse")).toBe("animals")
    expect(playgroundTool("donkey")).toBe("animals")
    expect(playgroundTool("rendering")).toBe("characters")
    expect(playgroundTool("unknown")).toBe("characters")
    expect(playgroundTool(null)).toBe("characters")
  })
})
