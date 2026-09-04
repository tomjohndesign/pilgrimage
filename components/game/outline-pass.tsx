"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"

import { useCameraStore } from "@/lib/game/camera-store"
import {
  OUTLINE_ID_LAYER,
  OUTLINE_THICKNESS_PX,
  type OutlineMode,
} from "@/lib/game/render/outline"

/** Warm near-black, so lines read as ink rather than dead pixels. */
const OUTLINE_COLOR = "#120b05"

const MODE_INT: Record<OutlineMode, number> = { off: 0, overlap: 1, silhouette: 2 }

/**
 * The scene, re-rendered each frame so the debug handle can composite the same
 * frame the player sees into its screenshots.
 */
export const outlineFrameRef: { current: (() => void) | null } = { current: null }

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

/**
 * Edge detection over the ID buffer. A pixel is outlined when a *nearer*
 * neighbour belongs to a different object — so the line lands on the occluded
 * side of the boundary, haloing the foreground shape from outside rather than
 * eating into it. Overlap mode additionally requires the outlined pixel itself
 * to be an object, so no line ever lands on terrain or the void.
 */
const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D tId;
  uniform sampler2D tDepth;
  uniform vec2 uTexel;
  uniform int uMode; // 1 = overlap only, 2 = full silhouette
  uniform vec3 uColor;
  varying vec2 vUv;

  float idAt(vec2 uv) {
    vec4 t = texture2D(tId, uv);
    return floor(t.r * 255.0 + 0.5) + 256.0 * floor(t.g * 255.0 + 0.5);
  }

  bool occludedBy(vec2 uv, float idC, float dC) {
    float idN = idAt(uv);
    if (idN < 0.5) return false;            // only objects cast a halo
    if (abs(idN - idC) < 0.5) return false; // same object, no boundary
    float dN = texture2D(tDepth, uv).x;
    return dN < dC - 1.0e-5;                // neighbour must be in front
  }

  void main() {
    float idC = idAt(vUv);
    if (uMode == 1 && idC < 0.5) discard; // overlap halos land only on objects
    float dC = texture2D(tDepth, vUv).x;
    bool edge =
      occludedBy(vUv + vec2(uTexel.x, 0.0), idC, dC) ||
      occludedBy(vUv - vec2(uTexel.x, 0.0), idC, dC) ||
      occludedBy(vUv + vec2(0.0, uTexel.y), idC, dC) ||
      occludedBy(vUv - vec2(0.0, uTexel.y), idC, dC);
    if (!edge) discard;
    gl_FragColor = vec4(uColor, 1.0);
  }
`

export function OutlinePass() {
  const { gl, scene, camera, size } = useThree()
  const dpr = useThree((s) => s.viewport.dpr)

  // ID + depth buffer at drawing-buffer resolution. Nearest filtering is load-
  // bearing: interpolated ID colours would decode as phantom objects.
  const target = useMemo(() => {
    const width = Math.max(1, Math.round(size.width * dpr))
    const height = Math.max(1, Math.round(size.height * dpr))
    return new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthTexture: new THREE.DepthTexture(width, height),
    })
  }, [size.width, size.height, dpr])

  useEffect(
    () => () => {
      target.depthTexture?.dispose()
      target.dispose()
    },
    [target],
  )

  const pass = useMemo(() => {
    const uniforms = {
      tId: { value: null as THREE.Texture | null },
      tDepth: { value: null as THREE.Texture | null },
      uTexel: { value: new THREE.Vector2() },
      uMode: { value: 0 },
      uColor: { value: new THREE.Color(OUTLINE_COLOR) },
    }
    const geometry = new THREE.BufferGeometry()
    // One triangle covering the whole screen — no quad seam, no matrices.
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    )
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    const quadScene = new THREE.Scene()
    quadScene.add(mesh)
    const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    return { uniforms, geometry, material, quadScene, quadCamera }
  }, [])

  useEffect(
    () => () => {
      pass.geometry.dispose()
      pass.material.dispose()
    },
    [pass],
  )

  const prevClearColor = useMemo(() => new THREE.Color(), [])

  const renderFrame = () => {
    const mode = useCameraStore.getState().outlineMode

    if (mode !== "off") {
      // ID pass: only the layer holding flat ID silhouettes, cleared to ID 0.
      const background = scene.background
      scene.background = null
      gl.getClearColor(prevClearColor)
      const prevClearAlpha = gl.getClearAlpha()
      gl.setClearColor(0x000000, 1)
      camera.layers.set(OUTLINE_ID_LAYER)
      gl.setRenderTarget(target)
      gl.render(scene, camera)
      gl.setRenderTarget(null)
      camera.layers.set(0)
      gl.setClearColor(prevClearColor, prevClearAlpha)
      scene.background = background
    }

    gl.render(scene, camera)

    if (mode !== "off") {
      pass.uniforms.tId.value = target.texture
      pass.uniforms.tDepth.value = target.depthTexture
      // Offsets in CSS pixels, so line weight is steady across zoom and DPR.
      pass.uniforms.uTexel.value.set(
        (OUTLINE_THICKNESS_PX * dpr) / target.width,
        (OUTLINE_THICKNESS_PX * dpr) / target.height,
      )
      pass.uniforms.uMode.value = MODE_INT[mode]
      const prevAutoClear = gl.autoClear
      gl.autoClear = false
      gl.render(pass.quadScene, pass.quadCamera)
      gl.autoClear = prevAutoClear
    }
  }

  const frameRef = useRef(renderFrame)
  frameRef.current = renderFrame

  useEffect(() => {
    outlineFrameRef.current = () => frameRef.current()
    return () => {
      outlineFrameRef.current = null
    }
  }, [])

  // Priority > 0 takes over rendering from react-three-fiber.
  useFrame(() => frameRef.current(), 1)

  return null
}
