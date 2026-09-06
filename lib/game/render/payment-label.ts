import * as THREE from "three"

// Native bitmap lettering keeps these small amounts crisp beside the characters.
const GLYPHS: Record<string, string[]> = {
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  // Native-pixel coin and timber icons for resource spending.
  "g": ["01110", "11001", "10101", "10101", "10101", "10011", "01110"],
  "w": ["000011100", "000110110", "001100101", "011001001", "110010010", "100100100", "011111000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
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

/** Gold income with a one-native-pixel dark border, using the scene's pixel size. */
export function paymentLabel(amount: number, resource?: "gold" | "wood"): THREE.DataTexture {
  const text = resource ? `${resource === "gold" ? "g" : "w"}-${amount}` : `+$${amount}`
  const width = [...text].reduce((sum, glyph) => sum + GLYPHS[glyph][0].length + 1, 1), height = 9
  const data = new Uint8Array(width * height * 4)
  const points: Array<[number, number]> = []
  let cursor = 1
  for (const glyph of text) {
    GLYPHS[glyph].forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === "1") points.push([cursor + x, 7 - y])
    })
    cursor += GLYPHS[glyph][0].length + 1
  }
  const paint = (x: number, y: number, color: number[]) => data.set(color, (y * width + x) * 4)
  for (const [x, y] of points) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) paint(x + dx, y + dy, [48, 33, 12, 255])
  for (const [x, y] of points) paint(x, y, resource ? [255, 108, 96, 255] : [255, 216, 106, 255])
  const texture = new THREE.DataTexture(data, width, height)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}
