import * as THREE from "three"

/** Flat, untextured scenery derives its face normal in the fragment shader.
 * Share identical positions across faces instead of transforming duplicate
 * vertices. Triangle order and positions stay exact, including silhouettes. */
export function indexFlatGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = source.getAttribute("position"), vertices: number[] = [], indices: number[] = []
  const unique = new Map<string, number>(), remap: number[] = []
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i), key = `${x}:${y}:${z}`
    let index = unique.get(key)
    if (index === undefined) { index = vertices.length / 3; unique.set(key, index); vertices.push(x, y, z) }
    remap.push(index)
  }
  const count = source.index?.count ?? position.count
  for (let i = 0; i < count; i++) indices.push(remap[source.index?.getX(i) ?? i])
  const geometry = new THREE.BufferGeometry()
  geometry.name = source.type
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  source.dispose()
  return geometry
}
