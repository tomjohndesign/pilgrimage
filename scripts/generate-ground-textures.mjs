// Shared sparse mineral flecks for earth, sand and hills; neutral for terrain tinting.
// Water is a transparent sheet of short pixel ripples, animated in WaterMotion.
import { spriteTile } from "./terrain-sprite-lib.mjs"
const ground = spriteTile([255, 255, 255], 90217)
ground.scatter(10, .6, (x, y, p) => ground.stamp(x, y, p < .5 ? ["dd"] : ["ddd", ".d."], { d: [242, 240, 235] }))
ground.save("ground")
// Warm, quiet sand: tiny grains and a few short wind combs, with no tile border.
const sand = spriteTile([211, 189, 133], 90219)
const grains = { d: [198, 176, 122], l: [222, 201, 149], s: [205, 183, 129] }
sand.scatter(7, .75, (x, y, p) => sand.stamp(x, y,
  p < .45 ? ["d.", ".l"] : p < .85 ? ["sdl"] : ["..lll..", "ss....."], grains))
sand.scatter(29, .55, (x, y, p) => sand.stamp(x, y,
  p < .5 ? ["....llll", "..ss....", "ss......"] : ["..llll..", "ss....ss"], grains))
sand.save("sand")
const water = spriteTile([0, 0, 0, 0], 90218)
water.scatter(16, .85, (x, y, p) => water.stamp(x, y,
  p < .5 ? [".llll.", "l....."] : ["..lllll", "ll....."], { l: [255, 255, 255] }))
water.save("water")
