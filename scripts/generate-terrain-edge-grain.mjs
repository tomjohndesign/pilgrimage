// Static native-pixel displacement and threshold texture shared by all terrain.
// No tile borders: offset the sampled continuous material field, not each sprite.
import { spriteTile } from "./terrain-sprite-lib.mjs"
const grain = spriteTile([128, 128, 128], 98127)
for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
  grain.dot(x, y, [Math.floor(grain.rng() * 256), Math.floor(grain.rng() * 256), Math.floor(grain.rng() * 256)])
}
grain.save("terrain-edge-grain-v1")
