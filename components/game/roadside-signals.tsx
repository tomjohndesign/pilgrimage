"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

const NOTE = ["00011000", "00011100", "00010110", "00010000", "00010000", "01110000", "11110000", "01100000"]
const COIN = ["00111100", "01122110", "11211211", "11222211", "11211211", "01122110", "00111100", "00000000"]

/** Small billboard marks share the character atlas's world pixel size and pause clock. */
export function RoadsideSignals({ type, size, pixelSize }: { type: "minstrel" | "beggar"; size: number; pixelSize: number }) {
  const root = useRef<THREE.Group>(null), elapsed = useRef(0)
  const textures = useMemo(() => [NOTE, COIN].map(pattern => {
    const data = new Uint8Array(8 * 8 * 4)
    pattern.forEach((row, y) => [...row].forEach((value, x) => {
      const index = ((7 - y) * 8 + x) * 4
      data.set(value === "0" ? [0, 0, 0, 0] : value === "2" ? [255, 229, 153, 255] : [223, 182, 92, 255], index)
    }))
    const texture = new THREE.DataTexture(data, 8, 8)
    texture.magFilter = texture.minFilter = THREE.NearestFilter
    texture.colorSpace = THREE.SRGBColorSpace
    texture.needsUpdate = true
    return texture
  }), [])
  useEffect(() => () => textures.forEach(texture => texture.dispose()), [textures])
  useFrame(({ camera }, delta) => {
    const group = root.current, actor = group?.parent?.parent
    if (!group || !actor) return
    const data = actor.userData
    elapsed.current += Math.min(delta, 0.1) * (data.playbackRate ?? 1)
    const playing = data.activity === "performing", begging = data.activity === "begging"
    group.visible = playing || begging || data.donated === true
    if (!group.visible) return
    // Cancel the actor's heading so the marks drift across the camera's plane.
    actor.getWorldQuaternion(group.quaternion).invert().multiply(camera.quaternion)
    const snap = (value: number) => Math.round(value / pixelSize) * pixelSize
    group.children.forEach((object, i) => {
      const sprite = object as THREE.Sprite
      const t = (elapsed.current * 0.65 + i / 3) % 1
      const music = i < 3
      sprite.visible = music ? type === "minstrel" && playing : begging || data.donated === true
      sprite.material.map = textures[music ? 0 : 1]
      sprite.position.set(snap(music ? (i - 1) * pixelSize * 6 + t * pixelSize * 3 : 0),
        snap(t * pixelSize * (music || data.donated ? 10 : 2)), 0)
      sprite.material.opacity = music || data.donated ? Math.min(1, (1 - t) * 3) : 0.85
    })
    group.position.y = size * (begging ? 0.44 : 0.59)
  })
  return <group ref={root} name="roadside-signals" visible={false}>
    {[0, 1, 2, 3].map(i => <sprite key={i} scale={8 * pixelSize} raycast={() => {}}>
      <spriteMaterial map={textures[0]} transparent depthWrite={false} toneMapped={false} />
    </sprite>)}
  </group>
}
