import type { BaseClip } from "../base-person/pose"
import { uncoverHead } from "../base-person/head-covering"
import * as THREE from "three"
import type { createBasePersonRig } from "../base-person/rig"

export const ROCKET_PALETTE = ["#303b43", "#607581", "#9cabb0", "#d6ded5", "#975031", "#dba346", "#ed672d", "#ffc65a", "#fff0aa"]

/** Small steel boosters and a brass-trimmed flame helmet on the shared sockets. */
export function createRocketRig(person: ReturnType<typeof createBasePersonRig>) {
  const back = new THREE.Group(), head = new THREE.Group(), jets = new THREE.Group(), crown = new THREE.Group()
  person.sockets.back.add(back); person.sockets.head.add(head)
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = []
  const steel = new THREE.MeshLambertMaterial({ color: "#9cabb0" })
  const dark = new THREE.MeshLambertMaterial({ color: "#303b43" })
  const brass = new THREE.MeshLambertMaterial({ color: "#dba346" })
  const leather = new THREE.MeshLambertMaterial({ color: "#975031" })
  const fire = new THREE.MeshBasicMaterial({ color: "#ed672d", toneMapped: false })
  const core = new THREE.MeshBasicMaterial({ color: "#fff0aa", toneMapped: false })
  materials.push(steel, dark, brass, leather, fire, core)
  function mesh(parent: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number]) {
    geometries.push(geometry)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(...position); mesh.userData.inkPart = 11; parent.add(mesh)
    return mesh
  }
  mesh(back, new THREE.BoxGeometry(0.48, 0.12, 0.08), leather, [0, -0.08, -0.08])
  for (const x of [-0.20, 0.20]) {
    mesh(back, new THREE.CylinderGeometry(0.12, 0.12, 0.56, 8), steel, [x, -0.04, -0.18])
    mesh(back, new THREE.ConeGeometry(0.12, 0.16, 8), brass, [x, 0.32, -0.18])
    for (const y of [-0.20, 0.10]) mesh(back, new THREE.CylinderGeometry(0.13, 0.13, 0.065, 8), dark, [x, y, -0.18])
    mesh(back, new THREE.CylinderGeometry(0.09, 0.14, 0.10, 8), dark, [x, -0.37, -0.18])
    mesh(jets, new THREE.ConeGeometry(0.115, 0.55, 5), fire, [x, -0.275, 0]).rotation.z = Math.PI
    mesh(jets, new THREE.ConeGeometry(0.075, 0.32, 5), core, [x, -0.16, 0.015]).rotation.z = Math.PI
  }
  jets.position.set(0, -0.42, -0.18); back.add(jets)
  mesh(head, new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), steel, [0, -0.15, 0])
    .scale.set(0.245, 0.21, 0.225)
  mesh(head, new THREE.CylinderGeometry(0.255, 0.255, 0.045, 10), brass, [0, -0.15, 0]).scale.z = 0.94
  crown.position.y = 0.035; head.add(crown)
  for (const x of [-0.075, 0, 0.075]) {
    mesh(crown, new THREE.ConeGeometry(0.065, x === 0 ? 0.29 : 0.20, 4), fire, [x, 0.10, 0])
    mesh(crown, new THREE.ConeGeometry(0.038, 0.15, 4), core, [x, 0.07, 0.035])
  }
  return {
    pose(phase: number, flying: boolean, clip: BaseClip = "idle") {
      head.visible = !uncoverHead("Male", clip)
      jets.visible = flying
      jets.scale.y = 0.85 + 0.15 * Math.sin(phase * Math.PI * 2)
      crown.scale.y = 0.9 + 0.1 * Math.sin(phase * Math.PI * 2)
    },
    dispose() {
      back.removeFromParent(); head.removeFromParent()
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose())
    },
  }
}
