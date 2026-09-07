import { expect, it } from "vitest"
import { NearestFilter } from "three"
import { constructionBarTexture, updateConstructionBar, CONSTRUCTION_BAR_WIDTH as W, CONSTRUCTION_BAR_HEIGHT as H } from "./construction-bar"

it("fills the native-pixel progress bar proportionally while retaining its border", () => {
  const texture = constructionBarTexture()
  const countGold = () => Array.from({ length: W * H }, (_, i) => texture.image.data![i * 4]).filter(r => r === 218).length
  updateConstructionBar(texture, 0)
  expect(countGold()).toBe(0)
  updateConstructionBar(texture, 0.5)
  expect(countGold()).toBe((W - 4) / 2 * (H - 4))
  updateConstructionBar(texture, 2)
  expect(countGold()).toBe((W - 4) * (H - 4))
  expect(Array.from(texture.image.data!.slice(0, 4))).toEqual([48, 33, 12, 255])
  expect(texture.magFilter).toBe(NearestFilter)
  texture.dispose()
})
