import * as THREE from "three"

// Native bitmap lettering keeps these small amounts crisp beside the characters.
const GLYPHS: Record<string, string[]> = {
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "✝": ["00100", "00100", "11111", "00100", "00100", "00100", "00100"],
  "$": ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
}

/** Gold or piety gains with a one-native-pixel border, using the scene's pixel size. */
export function paymentLabel(amount: number, symbol: "gold" | "cross" = "gold"): THREE.DataTexture {
  const text = `+${symbol === "cross" ? "✝" : "$"}${Math.round(amount)}`, width = text.length * 6 + 1, height = 9
  const data = new Uint8Array(width * height * 4)
  const points: Array<[number, number]> = []
  for (let i = 0; i < text.length; i++) GLYPHS[text[i]].forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === "1") points.push([i * 6 + x + 1, 7 - y])
  })
  const paint = (x: number, y: number, color: number[]) => data.set(color, (y * width + x) * 4)
  for (const [x, y] of points) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) paint(x + dx, y + dy, [48, 33, 12, 255])
  for (const [x, y] of points) paint(x, y, [255, 216, 106, 255])
  const texture = new THREE.DataTexture(data, width, height)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}
