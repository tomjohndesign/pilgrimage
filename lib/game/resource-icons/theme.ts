import type { IconTheme } from "./design"

export function luminance(rgb: ArrayLike<number>) {
  return [0.2126, 0.7152, 0.0722].reduce((sum, weight, i) => {
    const c = rgb[i] / 255
    return sum + weight * (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
  }, 0)
}

/** Theme-specific native-pixel contours. Keep authored faces and internal marks
 * intact (coin rim reflections, the map's dark plus, and portrait details).
 * Only the one-pixel ink outside the model changes, without blur or added width. */
export function themeIconEdges(inked: Uint8ClampedArray, model: Uint8ClampedArray, size: number, theme: IconTheme) {
  const output = new Uint8ClampedArray(inked)
  for (let i = 0; i < size * size * 4; i += 4) {
    if (!inked[i + 3] || model[i + 3] >= 128) continue
    const original = Array.from(inked.subarray(i, i + 3))
    const target = theme === "dark" ? [225, 213, 174] : [48, 40, 27]
    // Contrast against the brightest dark control (#334127) and light active
    // surface (#cbd5b7), so silhouettes also survive hover/pressed backgrounds.
    const background = theme === "dark" ? .047 : .635
    for (let step = 0; step <= 20; step++) {
      const color = original.map((v, channel) => Math.round(v + (target[channel] - v) * step / 20))
      const l = luminance(color)
      const contrast = theme === "dark" ? (l + .05) / (background + .05) : (background + .05) / (l + .05)
      output.set(color, i)
      if (contrast >= 3.2) break
    }
  }
  return output
}
