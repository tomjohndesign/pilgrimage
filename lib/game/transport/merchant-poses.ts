import type * as THREE from "three"

/** Upper-body keyframes layered onto the unmodified person rig. The shared
 * standing legs, garments, attachments, camera and ink pass are retained. */
export function merchantGesture(root: THREE.Group, gesture: "wave" | "offer", phase: number) {
  const t = Math.max(0, Math.min(1, phase)), envelope = Math.sin(Math.PI * t) ** 2
  const left = root.getObjectByName("left-shoulder")!, right = root.getObjectByName("right-shoulder")!
  const leftElbow = root.getObjectByName("left-elbow")!, rightElbow = root.getObjectByName("right-elbow")!
  if (gesture === "wave") {
    left.rotation.z += envelope * (1.85 + 0.22 * Math.sin(t * Math.PI * 6))
    left.rotation.x -= envelope * 0.25
    leftElbow.rotation.x -= envelope * 0.75
    leftElbow.rotation.z = envelope * Math.sin(t * Math.PI * 6) * 0.35
  } else {
    left.rotation.x -= envelope * 0.9; right.rotation.x -= envelope * 0.65
    left.rotation.z += envelope * 0.55; right.rotation.z -= envelope * 0.35
    leftElbow.rotation.x -= envelope * 0.3; rightElbow.rotation.x -= envelope * 0.45
  }
  const head = root.getObjectByName("head-pivot")!
  head.rotation.y += envelope * Math.sin(t * Math.PI * 2) * 0.15
  head.rotation.x += envelope * 0.06
  root.updateMatrixWorld(true)
}
