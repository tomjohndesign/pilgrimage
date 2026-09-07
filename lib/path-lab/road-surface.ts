import { coords, DEPTH, indexAt, pathEdgeIndex, stepAllowed, WALK_DIRS, WIDTH, type PathWorld } from "./simulation"

export const CELL = 24
const PIXEL = 2
export const SURFACE_WIDTH = WIDTH * CELL / PIXEL
export const SURFACE_DEPTH = DEPTH * CELL / PIXEL
const buffers = new WeakMap<CanvasRenderingContext2D, Float32Array>()

/** Union real traveled segments on the same two-pixel grid as the moving markers. */
export function pathCoverage(world: PathWorld, pixels: Float32Array = new Float32Array(SURFACE_WIDTH * SURFACE_DEPTH), pixelsPerTile = CELL / PIXEL): Float32Array {
  const surfaceWidth = WIDTH * pixelsPerTile, surfaceDepth = DEPTH * pixelsPerTile, unit = CELL / pixelsPerTile
  pixels.fill(0)
  const stamp = (ax: number, az: number, bx: number, bz: number, aWear: number, bWear: number) => {
    const radius = (4 + Math.max(aWear, bWear) * 18) / (2 * unit)
    const dx = bx - ax, dz = bz - az, lengthSquared = dx * dx + dz * dz
    for (let z = Math.max(0, Math.floor(Math.min(az, bz) - radius)); z < Math.min(surfaceDepth, Math.ceil(Math.max(az, bz) + radius)); z++) {
      for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - radius)); x < Math.min(surfaceWidth, Math.ceil(Math.max(ax, bx) + radius)); x++) {
        const t = lengthSquared ? Math.max(0, Math.min(1, ((x + .5 - ax) * dx + (z + .5 - az) * dz) / lengthSquared)) : 0
        const wear = aWear + (bWear - aWear) * t
        const r = (4 + wear * 18) / (2 * unit)
        if ((x + .5 - ax - dx * t) ** 2 + (z + .5 - az - dz * t) ** 2 > r * r) continue
        const i = z * surfaceWidth + x
        pixels[i] = Math.max(pixels[i], wear)
      }
    }
  }
  for (let i = 0; i < world.wear.length; i++) {
    if (world.blocked[i] || world.wear[i] <= .03) continue
    const a = coords(i), ax = (a.x + .5) * pixelsPerTile, az = (a.z + .5) * pixelsPerTile
    stamp(ax, az, ax, az, world.wear[i], world.wear[i])
    WALK_DIRS.forEach(([dx, dz], direction) => {
      if (!(world.pathLinks[i] & (1 << direction))) return
      const x = a.x + dx, z = a.z + dz, next = indexAt(x, z)
      if (x < 0 || x >= WIDTH || z < 0 || z >= DEPTH || next <= i || world.wear[next] <= .03 || !stepAllowed(world.blocked, i, next)) return
      const wear = world.edgeWear[pathEdgeIndex(i, next)]
      if (wear <= .03) return
      stamp(ax, az, (x + .5) * pixelsPerTile, (z + .5) * pixelsPerTile, Math.min(world.wear[i], wear), Math.min(world.wear[next], wear))
    })
  }
  return pixels
}

export function drawPathSurface(ctx: CanvasRenderingContext2D, world: PathWorld): void {
  let pixels = buffers.get(ctx)
  if (!pixels) { pixels = new Float32Array(SURFACE_WIDTH * SURFACE_DEPTH); buffers.set(ctx, pixels) }
  pathCoverage(world, pixels)
  ctx.fillStyle = "#c7a66d"
  for (let i = 0; i < pixels.length; i++) {
    if (!pixels[i]) continue
    ctx.globalAlpha = Math.min(1, pixels[i] * 2.8)
    ctx.fillRect(i % SURFACE_WIDTH * PIXEL, Math.floor(i / SURFACE_WIDTH) * PIXEL, PIXEL, PIXEL)
  }
  ctx.globalAlpha = 1
}
