import { expect, it } from "vitest"
import * as THREE from "three"
import { updateBillboardWorld, updateTranslatedWorld } from "./sprite-transforms"

it("matches full Three matrix multiplication for translated poses and scaled billboards", () => {
  const parent = new THREE.Group(), pose = new THREE.Group(), sprite = new THREE.Sprite()
  parent.add(pose); pose.add(sprite)
  for (let i = 0; i < 80; i++) {
    parent.position.set(i - 40, Math.sin(i), 40 - i)
    parent.rotation.set(i * .07, i * .13, i * .03); parent.scale.set(1 + i / 100, 1, 2)
    pose.position.set(Math.sin(i) * .1, i * .001, Math.cos(i) * .12)
    sprite.scale.set(.7 + i / 80, 1.1, 1)
    parent.updateWorldMatrix(true, true)
    const poseWorld = pose.matrixWorld.clone(), spriteWorld = sprite.matrixWorld.clone()
    pose.matrixWorld.identity(); sprite.matrixWorld.identity()
    updateTranslatedWorld(pose); updateBillboardWorld(sprite)
    expect(pose.matrixWorld.elements).toEqual(poseWorld.elements)
    expect(sprite.matrixWorld.elements).toEqual(spriteWorld.elements)
  }
})

it("retains the general transform path for edited sprite offsets and rotated pose roots", () => {
  const parent = new THREE.Group(), pose = new THREE.Group(), sprite = new THREE.Sprite()
  parent.add(pose); pose.add(sprite)
  parent.position.x = 8; pose.rotation.y = .3; sprite.position.x = .5; sprite.rotation.z = .7
  parent.updateWorldMatrix(true, true)
  const poseWorld = pose.matrixWorld.clone(), spriteWorld = sprite.matrixWorld.clone()
  pose.matrixWorld.identity(); sprite.matrixWorld.identity()
  updateTranslatedWorld(pose); updateBillboardWorld(sprite)
  expect(pose.matrixWorld.elements).toEqual(poseWorld.elements)
  expect(sprite.matrixWorld.elements).toEqual(spriteWorld.elements)
})
