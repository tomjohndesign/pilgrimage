/** Small local queries over world positions. Call relocate after moving an
 * indexed point across cells. Original ordering is retained for Array.find. */
export class SpatialPoints<T extends { x: number; z: number }> {
  private cells = new Map<number, Map<number, Array<{ point: T; order: number }>>>()
  private nextOrder = 0
  constructor(points: readonly T[], private cellSize = 4) {
    for (const point of points) this.add(point)
  }

  /** Reservations made earlier in a tick are visible to later actors. */
  add(point: T): void {
    const order = this.nextOrder++
    const x = Math.floor(point.x / this.cellSize), z = Math.floor(point.z / this.cellSize)
    let column = this.cells.get(x)
    if (!column) this.cells.set(x, column = new Map())
    let cell = column.get(z)
    if (!cell) column.set(z, cell = [])
    cell.push({ point, order })
  }

  /** Keep later decisions in the same simulation tick aware of earlier moves. */
  relocate(point: T, fromX: number, fromZ: number): void {
    const oldX = Math.floor(fromX / this.cellSize), oldZ = Math.floor(fromZ / this.cellSize)
    const x = Math.floor(point.x / this.cellSize), z = Math.floor(point.z / this.cellSize)
    if (x === oldX && z === oldZ) return
    const oldColumn = this.cells.get(oldX), oldCell = oldColumn?.get(oldZ)
    const index = oldCell?.findIndex(entry => entry.point === point) ?? -1
    if (!oldCell || index < 0) return
    const entry = oldCell[index]
    oldCell.splice(index, 1)
    if (!oldCell.length) { oldColumn!.delete(oldZ); if (!oldColumn!.size) this.cells.delete(oldX) }
    let column = this.cells.get(x)
    if (!column) this.cells.set(x, column = new Map())
    let cell = column.get(z)
    if (!cell) column.set(z, cell = [])
    cell.push(entry)
  }

  forEachWithin(x: number, z: number, radius: number, visit: (point: T, order: number) => void): void {
    const radiusSquared = radius * radius
    for (let cx = Math.floor((x - radius) / this.cellSize); cx <= Math.floor((x + radius) / this.cellSize); cx++) {
      const column = this.cells.get(cx)
      if (!column) continue
      for (let cz = Math.floor((z - radius) / this.cellSize); cz <= Math.floor((z + radius) / this.cellSize); cz++) {
        const cell = column.get(cz)
        if (!cell) continue
        for (const entry of cell) {
          const dx = entry.point.x - x, dz = entry.point.z - z
          if (dx * dx + dz * dz < radiusSquared) visit(entry.point, entry.order)
        }
      }
    }
  }

  firstWithin(x: number, z: number, radius: number, accept?: (point: T, order: number) => boolean): T | undefined {
    let first: T | undefined, order = Infinity
    this.forEachWithin(x, z, radius, (point, index) => {
      if (index < order && (!accept || accept(point, index))) { first = point; order = index }
    })
    return first
  }
}
