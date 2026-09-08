import * as THREE from "three"

/** Wide buildings use their authored colors without camera-linked dark faces.
 * One resident shader serves both levels; the distant branch skips lighting. */
export function buildingSurfaceMaterial(shading: { value: number }) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
  material.onBeforeCompile = shader => {
    shader.uniforms.buildingShading = shading
    shader.fragmentShader = "uniform float buildingShading;\n" + shader.fragmentShader
      .replace("#include <lights_lambert_fragment>", "if (buildingShading > 0.0) {\n#include <lights_lambert_fragment>")
      .replace("#include <aomap_fragment>", "#include <aomap_fragment>\n}")
      .replace("#include <opaque_fragment>", "outgoingLight = mix(diffuseColor.rgb, outgoingLight, buildingShading);\n#include <opaque_fragment>")
  }
  material.customProgramCacheKey = () => "building-distance-lighting-v1"
  return material
}

export interface BuildingBatchSource {
  body: THREE.Mesh
  ids: THREE.Mesh
  levels: THREE.BufferGeometry[]
}

/** Four-building-sized cells bound overdraw while amortizing individual draws. */
export function buildingBatchCell(source: BuildingBatchSource) {
  const e = source.body.matrixWorld.elements
  return `${Math.floor(e[12] / 16)},${Math.floor(e[14] / 16)}`
}

/** Bake static world transforms once. Color and ID surfaces share positions and
 * indices, retaining exact overlap/selection identity at every detail level. */
export function mergedBuildingBlock(sources: readonly BuildingBatchSource[]) {
  const count = sources.reduce((sum, source) => sum + source.levels[0].getAttribute("position").count, 0)
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3), ids = new Float32Array(count * 3)
  const indices: number[][] = [[], [], []]
  const point = new THREE.Vector3(), normal = new THREE.Vector3(), normalMatrix = new THREE.Matrix3()
  let offset = 0
  for (const source of sources) {
    const geometry = source.levels[0], position = geometry.getAttribute("position"), n = geometry.getAttribute("normal")
    const color = geometry.getAttribute("color"), id = (source.ids.material as THREE.MeshBasicMaterial).color
    normalMatrix.getNormalMatrix(source.body.matrixWorld)
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(source.body.matrixWorld).toArray(positions, (offset + i) * 3)
      normal.fromBufferAttribute(n, i).applyNormalMatrix(normalMatrix).toArray(normals, (offset + i) * 3)
      colors[(offset + i) * 3] = color.getX(i); colors[(offset + i) * 3 + 1] = color.getY(i); colors[(offset + i) * 3 + 2] = color.getZ(i)
      id.toArray(ids, (offset + i) * 3)
    }
    for (let level = 0; level < 3; level++) {
      const index = source.levels[level].index
      if (index) for (let i = 0; i < index.count; i++) indices[level].push(offset + index.getX(i))
      else for (let i = 0; i < position.count; i++) indices[level].push(offset + i)
    }
    offset += position.count
  }
  const attributes = { position: new THREE.BufferAttribute(positions, 3), normal: new THREE.BufferAttribute(normals, 3) }
  const color = new THREE.BufferAttribute(colors, 3), identity = new THREE.BufferAttribute(ids, 3)
  const body = indices.map(index => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", attributes.position); geometry.setAttribute("normal", attributes.normal)
    geometry.setAttribute("color", color); geometry.setIndex(index); geometry.computeBoundingSphere()
    return geometry
  })
  const outline = body.map(original => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", attributes.position); geometry.setAttribute("color", identity)
    geometry.setIndex(original.index); geometry.boundingSphere = original.boundingSphere!.clone()
    return geometry
  })
  return { body, ids: outline, dispose: () => { for (const geometry of [...body, ...outline]) geometry.dispose() } }
}
