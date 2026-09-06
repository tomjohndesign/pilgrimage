/** Remove only paper connected to the cell border for the on-map preview.
 * Enclosed pale plaster is preserved. Source files and exports are untouched.
 * This is a convenience for ivory studies, not production alpha cleanup.
 */
export function hidePreviewPaper(data: Uint8ClampedArray, width: number, height: number): void {
  const count = width * height
  if (data.length !== count * 4) throw new Error("Invalid preview pixels.")
  const visited = new Uint8Array(count), queue = new Int32Array(count)
  let head = 0, tail = 0
  const add = (i: number) => {
    if (visited[i]) return
    visited[i] = 1
    const p = i * 4, r = data[p], g = data[p + 1], b = data[p + 2]
    if (data[p + 3] < 8 || r > 218 && g > 208 && b > 188 && Math.max(r, g, b) - Math.min(r, g, b) < 48) queue[tail++] = i
  }
  for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x) }
  for (let y = 0; y < height; y++) { add(y * width); add(y * width + width - 1) }
  while (head < tail) {
    const i = queue[head++], x = i % width
    data[i * 4 + 3] = 0
    if (x > 0) add(i - 1)
    if (x < width - 1) add(i + 1)
    if (i >= width) add(i - width)
    if (i < count - width) add(i + width)
  }
}
