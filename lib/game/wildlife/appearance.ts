import { deriveSeed, makeRng, SEED_STREAM } from "../rng"

/** Subtle natural coat/plumage tones preserve each species' authored markings. */
export const WILDLIFE_COATS = [
  { id: "natural", label: "Natural", tint: "#ffffff" },
  { id: "warm", label: "Warm", tint: "#ead8bf" },
  { id: "dark", label: "Dark", tint: "#bcb6ae" },
  { id: "cool", label: "Cool", tint: "#d5dbe0" },
] as const

/** Appearance never consumes the movement/herd generation stream. */
export function wildlifeAppearance(seed: number, id: number) {
  const random = makeRng(deriveSeed(deriveSeed(seed, SEED_STREAM.wildlifeAppearance), id))
  return WILDLIFE_COATS[Math.floor(random() * WILDLIFE_COATS.length)]
}
