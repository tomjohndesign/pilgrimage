import * as THREE from "three"
import { makeRng } from "../../rng"
import { softenTreeLighting } from "../lighting"
import { BARK_PALETTE, FOLIAGE_RAMPS, type FoliageDesign, type FoliageSpecies } from "./design"

/** Editable branch structure and leaf clusters are source geometry, never map meshes. */
export function createFoliageModel(species: FoliageSpecies, variant: number, design: FoliageDesign) {
  const rng = makeRng(1709 + variant * 7919 + ({ oak: 0, birch: 31, scotsPine: 67, beech: 103, hawthorn: 139, holly: 173 }[species]))
  const root = new THREE.Group()
  const height = design.height * [0.9, 1, 1.06][variant]
  const spread = design.spread * [0.96, 1.04, 1][variant]
  const materials: THREE.Material[] = []
  const geometries: THREE.BufferGeometry[] = []
  const material = (color: string) => {
    const m = new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide })
    m.onBeforeCompile = softenTreeLighting
    materials.push(m)
    return m
  }
  const bark = material(species === "birch" ? BARK_PALETTE[4] : species === "beech" ? BARK_PALETTE[6] : BARK_PALETTE[1])
  const twig = material(species === "birch" ? BARK_PALETTE[2] : BARK_PALETTE[0])
  const up = new THREE.Vector3(0, 1, 0)
  const branch = (a: THREE.Vector3, b: THREE.Vector3, radius: number, m = bark) => {
    const delta = b.clone().sub(a)
    const geometry = new THREE.CylinderGeometry(radius * 0.55, radius, delta.length(), 5)
    geometries.push(geometry)
    const mesh = new THREE.Mesh(geometry, m)
    mesh.position.copy(a).add(b).multiplyScalar(0.5)
    mesh.quaternion.setFromUnitVectors(up, delta.normalize())
    root.add(mesh)
  }
  // Fewer, broader blades keep readable leaf groups without enlarging native pixels.
  const leafGeometry = new THREE.BufferGeometry()
  leafGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0, 0, -0.6, 0.45, 0, 0, 1, 0,
    0, 0, 0, 0, 1, 0, 0.6, 0.45, 0,
  ], 3))
  leafGeometry.computeVertexNormals(); geometries.push(leafGeometry)
  const leaves: { matrix: THREE.Matrix4; color: THREE.Color }[] = []
  const family = (species === "scotsPine" || species === "holly" ? [0, 1, 0] : species === "birch" ? [1, 2, 2] : [1, 2, 0])[variant]
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3()
  const cluster = (center: THREE.Vector3, radius: number, vertical = 0.65) => {
    const count = Math.round(48 * design.density * (radius / 0.22) ** 2)
    const ramp = FOLIAGE_RAMPS[rng() > 0.78 ? 1 : family]
    const baseShade = (species === "birch" ? 3 : species === "holly" ? 1 : 2) + (rng() > 0.7 ? 1 : 0)
    for (let i = 0; i < count; i++) {
      const angle = rng() * Math.PI * 2, z = rng() * 2 - 1
      const r = Math.cbrt(rng()), horizontal = Math.sqrt(1 - z * z)
      position.set(center.x + Math.cos(angle) * horizontal * r * radius,
        center.y + z * r * radius * vertical, center.z + Math.sin(angle) * horizontal * r * radius)
      const size = (0.105 + rng() * 0.055) * design.leafSize
      scale.set(size * (species === "scotsPine" ? 1.25 : 1), size, size)
      rotation.setFromEuler(new THREE.Euler((rng() - 0.5) * 2.2, rng() * Math.PI * 2, (rng() - 0.5) * 2))
      matrix.compose(position, rotation, scale)
      const shade = Math.min(5, Math.max(0, baseShade + (z > 0.45 ? 1 : z < -0.25 ? -1 : 0)))
      leaves.push({ matrix: matrix.clone(), color: new THREE.Color(ramp[shade]) })
    }
  }
  const origin = new THREE.Vector3()
  if (species === "oak") {
    const fork = new THREE.Vector3((rng() - 0.5) * 0.1, height * 0.3, 0)
    branch(origin, fork, 0.105)
    // A broad, asymmetrical crown with foliage at branch tips and open forks.
    for (let limb = 0; limb < 7; limb++) {
      const angle = limb * 2.4 + rng() * 0.45
      const reach = (0.55 + rng() * 0.32) * spread
      const elbow = new THREE.Vector3(Math.cos(angle) * reach * 0.52, height * (0.48 + rng() * 0.12), Math.sin(angle) * reach * 0.52)
      const tip = new THREE.Vector3(Math.cos(angle) * reach, height * (0.62 + rng() * 0.18), Math.sin(angle) * reach)
      branch(fork, elbow, 0.065); branch(elbow, tip, 0.038)
      for (let j = 0; j < 5; j++) {
        const a = angle + (j - 2) * 0.62
        const end = tip.clone().add(new THREE.Vector3(Math.cos(a) * 0.2 * spread, (rng() - 0.15) * 0.3, Math.sin(a) * 0.2 * spread))
        branch(elbow.clone().lerp(tip, 0.65), end, 0.014, twig)
        cluster(end, (0.2 + rng() * 0.1) * spread)
      }
    }
    cluster(new THREE.Vector3(-0.08, height * 0.77, 0.03), 0.38 * spread)
  } else if (species === "birch") {
    const lean = (rng() - 0.5) * 0.2
    const middle = new THREE.Vector3(lean * 0.4, height * 0.48, 0)
    const top = new THREE.Vector3(lean, height * 0.91, 0)
    branch(origin, middle, 0.048); branch(middle, top, 0.027)
    for (let i = 0; i < 16; i++) {
      const angle = i * 2.4, level = 0.37 + i / 16 * 0.5
      const start = new THREE.Vector3(lean * level, height * level, 0)
      const reach = (0.32 + Math.sin(i / 16 * Math.PI) * 0.4) * spread
      const tip = new THREE.Vector3(start.x + Math.cos(angle) * reach, start.y + 0.18, Math.sin(angle) * reach)
      branch(start, tip, 0.013, twig)
      for (let j = 0; j < 3; j++) {
        const end = tip.clone().add(new THREE.Vector3((rng() - 0.5) * 0.24, -j * 0.13, (rng() - 0.5) * 0.24))
        branch(tip, end, 0.007, twig); cluster(end, (0.14 + rng() * 0.075) * spread, 0.9)
      }
    }
    // Small dark bark marks keep birch trunks from reading as white poles.
    for (let i = 0; i < 10; i++) {
      const y = height * (0.06 + i * 0.065), a = new THREE.Vector3(lean * y / height - 0.022, y, 0.043)
      branch(a, a.clone().add(new THREE.Vector3(0.04, 0.008, 0)), 0.008, twig)
    }
    cluster(top, 0.16, 1.1)
  } else if (species === "beech") {
    // Smooth upright bole and layered, spreading limbs beneath a broad dense crown.
    const fork = new THREE.Vector3(0.03, height * 0.48, -0.02)
    branch(origin, fork, 0.09)
    branch(fork, new THREE.Vector3(-0.03, height * 0.91, 0), 0.053)
    for (let i = 0; i < 15; i++) {
      const level = 0.46 + i / 15 * 0.4, angle = i * 2.4 + rng() * 0.2
      const reach = (0.86 - Math.max(0, level - 0.6) * 1.65) * spread
      const start = new THREE.Vector3(0, height * level, 0)
      const elbow = new THREE.Vector3(Math.cos(angle) * reach * 0.55, start.y + 0.1, Math.sin(angle) * reach * 0.55)
      branch(start, elbow, 0.036)
      for (let j = 0; j < 3; j++) {
        const a = angle + (j - 1) * 0.4
        const tip = new THREE.Vector3(Math.cos(a) * reach, start.y + 0.2 + rng() * 0.1, Math.sin(a) * reach)
        branch(elbow, tip, 0.018)
        cluster(tip, (0.26 + rng() * 0.06) * spread, 0.8)
      }
    }
    cluster(new THREE.Vector3(-0.03, height * 0.9, 0), 0.34 * spread, 0.85)
  } else if (species === "hawthorn") {
    // Short crooked stems, open forks and an uneven scrub crown.
    const knee = new THREE.Vector3(-0.08, height * 0.24, 0.02)
    const base = new THREE.Vector3(0, 0.12, 0)
    branch(origin, base, 0.065); branch(base, knee, 0.06)
    for (let i = 0; i < 6; i++) {
      const angle = i * 2.4, reach = (0.45 + rng() * 0.3) * spread
      const elbow = new THREE.Vector3(Math.cos(angle) * reach * 0.5, height * (0.44 + rng() * 0.1), Math.sin(angle) * reach * 0.5)
      branch(knee, elbow, 0.035)
      for (let j = 0; j < 4; j++) {
        const a = angle + (j - 1.5) * 0.48
        const tip = new THREE.Vector3(Math.cos(a) * reach, height * (0.65 + rng() * 0.2), Math.sin(a) * reach)
        branch(elbow, tip, 0.014)
        cluster(tip, (0.21 + rng() * 0.05) * spread, 0.9)
      }
    }
    cluster(new THREE.Vector3(0, height * 0.74, 0), 0.25 * spread, 0.9)
  } else if (species === "holly") {
    // Dense evergreen sprays taper upward; the outline comes from leaves, not cones.
    branch(origin, new THREE.Vector3(0.02, height * 0.93, 0), 0.048)
    for (let i = 0; i < 22; i++) {
      const level = 0.33 + i / 22 * 0.58, angle = i * 2.4
      const reach = (0.67 * (1 - (level - 0.33) / 0.72)) * spread
      const start = new THREE.Vector3(0, height * level, 0)
      const end = new THREE.Vector3(Math.cos(angle) * reach, start.y + 0.12, Math.sin(angle) * reach)
      branch(start, end, 0.015)
      cluster(end, (0.17 + (1 - level) * 0.15) * spread, 1)
      cluster(end.clone().multiplyScalar(0.65).addScaledVector(start, 0.35), 0.18 * spread, 1)
    }
    cluster(new THREE.Vector3(0.02, height * 0.94, 0), 0.13 * spread, 1.2)
  } else {
    // Deliberately stylized pine: a pointed crown and wide, stepped lower boughs.
    branch(origin, new THREE.Vector3(0, height * 0.97, 0), 0.065)
    for (let tier = 0; tier < 8; tier++) {
      const t = tier / 7, level = 0.34 + t * 0.58
      const reach = (0.92 * (1 - t) + 0.06) * spread
      for (let spoke = 0; spoke < 5; spoke++) {
        const angle = spoke * Math.PI * 2 / 5 + tier * 1.3 + rng() * 0.18
        const start = new THREE.Vector3(0, height * level, 0)
        const elbow = new THREE.Vector3(Math.cos(angle) * reach * 0.58, start.y - 0.045, Math.sin(angle) * reach * 0.58)
        const end = new THREE.Vector3(Math.cos(angle) * reach, start.y + 0.04, Math.sin(angle) * reach)
        branch(start, elbow, 0.024 * (1 - t * 0.7)); branch(elbow, end, 0.014 * (1 - t * 0.7))
        cluster(elbow, (0.23 - t * 0.11) * spread, 0.5)
        cluster(end, (0.24 - t * 0.12) * spread, 0.48)
      }
    }
    cluster(new THREE.Vector3(0, height * 0.97, 0), 0.105 * spread, 1.3)
  }

  const leafMaterial = material("#ffffff")
  // Keep the southeast cue subtle on individual blades; crown color carries form.
  leafMaterial.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>",
      "outgoingLight = mix(diffuseColor.rgb, outgoingLight, 0.18);\n#include <opaque_fragment>")
  }
  const mesh = new THREE.InstancedMesh(leafGeometry, leafMaterial, leaves.length)
  leaves.forEach((leaf, i) => { mesh.setMatrixAt(i, leaf.matrix); mesh.setColorAt(i, leaf.color) })
  mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor!.needsUpdate = true
  root.add(mesh)
  return { root, leafCount: leaves.length, dispose() {
    mesh.dispose(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose())
  } }
}
