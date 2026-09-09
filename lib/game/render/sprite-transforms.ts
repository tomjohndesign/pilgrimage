import type { Object3D, Sprite } from "three"

/** A pose root only translates its sprite; preserve Matrix4's translation
 * arithmetic without multiplying the twelve unchanged rotation/scale entries. */
export function updateTranslatedWorld(object: Object3D): void {
  const parent = object.parent, q = object.quaternion, scale = object.scale
  if (!parent || !object.matrixAutoUpdate || !object.matrixWorldAutoUpdate ||
    q.x !== 0 || q.y !== 0 || q.z !== 0 || q.w !== 1 || scale.x !== 1 || scale.y !== 1 || scale.z !== 1) {
    object.updateWorldMatrix(false, false); return
  }
  const { x, y, z } = object.position, p = parent.matrixWorld.elements, w = object.matrixWorld.elements
  object.matrix.makeTranslation(x, y, z)
  for (let i = 0; i < 12; i++) w[i] = p[i] + 0
  for (let i = 0; i < 4; i++) w[12 + i] = p[i] * x + p[4 + i] * y + p[8 + i] * z + p[12 + i]
  object.matrixWorldNeedsUpdate = false
}

/** Billboard children use a scale matrix with no local offset or rotation.
 * The general path remains available for edited/offset source sprites. */
export function updateBillboardWorld(sprite: Sprite): void {
  const parent = sprite.parent, q = sprite.quaternion, position = sprite.position
  if (!parent || !sprite.matrixAutoUpdate || !sprite.matrixWorldAutoUpdate ||
    position.x !== 0 || position.y !== 0 || position.z !== 0 || q.x !== 0 || q.y !== 0 || q.z !== 0 || q.w !== 1) {
    sprite.updateWorldMatrix(false, false); return
  }
  const { x, y, z } = sprite.scale, p = parent.matrixWorld.elements, w = sprite.matrixWorld.elements
  sprite.matrix.makeScale(x, y, z)
  for (let i = 0; i < 4; i++) {
    w[i] = p[i] * x + 0; w[4 + i] = p[4 + i] * y + 0
    w[8 + i] = p[8 + i] * z + 0; w[12 + i] = p[12 + i] + 0
  }
  sprite.matrixWorldNeedsUpdate = false
}
