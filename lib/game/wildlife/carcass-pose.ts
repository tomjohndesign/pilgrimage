import { Matrix4, Vector3, type Mesh } from "three"

/** Roll the existing animal rig onto its side without stretching its bones.
 * Ground contact comes from the posed hide, including edited sheep/goat rigs. */
export function carcassPose(parts: readonly Mesh[], progress: number) {
  const blend = Math.max(0, Math.min(1, progress / .3))
  const roll = blend * blend * (3 - 2 * blend) * Math.PI / 2
  const rotation = new Matrix4().makeRotationZ(roll), matrix = new Matrix4(), point = new Vector3()
  let bottom = Infinity, left = Infinity, right = -Infinity
  for (const part of parts) {
    matrix.multiplyMatrices(rotation, part.matrixWorld)
    const positions = part.geometry.attributes.position
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(matrix)
      bottom = Math.min(bottom, point.y)
      left = Math.min(left, point.x); right = Math.max(right, point.x)
    }
  }
  return { roll, lift: Number.isFinite(bottom) ? -bottom : 0, x: Number.isFinite(left) ? -(left + right) / 2 * blend : 0 }
}
