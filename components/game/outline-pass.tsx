"use client"

import { useEffect, useMemo } from "react"
import { useThree } from "@react-three/fiber"
import * as THREE from "three"
import { usePixelScene } from "@/components/pixel-canvas"
import { CHARACTER_ID_LAYER } from "@/lib/game/render/pixel-characters"

import { useCameraStore } from "@/lib/game/camera-store"
import { useBuildStore } from "@/lib/game/build-store"
import { SELECTION_OUTLINE_COLOR, SELECTION_OUTLINE_OPACITY, SELECTION_FILL, SELECTION_FILL_OPACITY, selectionObjectId } from "@/lib/game/selection"
import {
  OUTLINE_ID_LAYER,
  SELECTED_CHARACTER_LAYER,
  MAX_OBJECT_ID,
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
  uniform sampler2D tCharacter;
  uniform sampler2D tCharacterDepth;
  uniform bool uCharacterSelected;
  uniform bool uCharacterPass;
  uniform float uCharacterIdMin;
  uniform vec2 uTexel;
  uniform int uMode; // 1 = overlap only, 2 = full silhouette
  uniform vec3 uColor;
  uniform float uSelectedId;
  uniform vec3 uSelectionColor;
  uniform float uSelectionOutlineOpacity;
  uniform vec3 uSelectionFill;
  uniform float uSelectionOpacity;
  varying vec2 vUv;

  void finishColor() {
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }

  float idAt(vec2 uv) {
    vec4 t = texture2D(tId, uv);
    // 24-bit ID, exact in highp float (24-bit mantissa) — see MAX_OBJECT_ID.
    return floor(t.r * 255.0 + 0.5)
      + 256.0 * floor(t.g * 255.0 + 0.5)
      + 65536.0 * floor(t.b * 255.0 + 0.5);
  }

  bool occludedBy(vec2 uv, float idC, float dC) {
    float idN = idAt(uv);
    if (idN < 0.5) return false;            // only objects cast a halo
    if (abs(idN - idC) < 0.5) return false; // same object, no boundary
    // Scenery-only edges already exist in the enlarged world image.
    if (uCharacterPass && idC < uCharacterIdMin && idN < uCharacterIdMin) return false;
    float dN = texture2D(tDepth, uv).x;
    return dN < dC - 1.0e-5;                // neighbour must be in front
  }

  bool selectedNeighbour(vec2 uv, float dC) {
    return abs(idAt(uv) - uSelectedId) < 0.5
      && texture2D(tDepth, uv).x < dC - 1.0e-5;
  }

  void main() {
    float idC = idAt(vUv);
    float dC = texture2D(tDepth, vUv).x;
    if (uCharacterSelected) {
      vec4 character = texture2D(tCharacter, vUv);
      if (character.a > 0.5) {
        bool hidden = abs(idC - uSelectedId) > 0.5
          && texture2D(tCharacterDepth, vUv).x > dC + 1.0e-5;
        if (hidden) {
          // A 50% mask over just the overlapping silhouette lets the real
          // character show through while keeping the foreground readable.
          gl_FragColor = vec4(mix(character.rgb, uSelectionFill, uSelectionOpacity), 0.5);
        } else {
          gl_FragColor = vec4(uSelectionFill, uSelectionOpacity);
        }
        finishColor(); return;
      }
      bool characterEdge =
        texture2D(tCharacter, vUv + vec2(uTexel.x, 0.0)).a > 0.5 ||
        texture2D(tCharacter, vUv - vec2(uTexel.x, 0.0)).a > 0.5 ||
        texture2D(tCharacter, vUv + vec2(0.0, uTexel.y)).a > 0.5 ||
        texture2D(tCharacter, vUv - vec2(0.0, uTexel.y)).a > 0.5;
      if (characterEdge) {
        gl_FragColor = vec4(uSelectionColor, uSelectionOutlineOpacity);
        finishColor(); return;
      }
    }
    if (!uCharacterSelected && uSelectedId > 0.5 && abs(idC - uSelectedId) < 0.5) {
      gl_FragColor = vec4(uSelectionFill, uSelectionOpacity);
      finishColor(); return;
    }
    // A thin halo belongs outside the shape, on its background side only.
    // Nearer objects still hide the selected object and its highlight.
    if (!uCharacterSelected && uSelectedId > 0.5) {
      bool selectedEdge =
        selectedNeighbour(vUv + vec2(uTexel.x, 0.0), dC) ||
        selectedNeighbour(vUv - vec2(uTexel.x, 0.0), dC) ||
        selectedNeighbour(vUv + vec2(0.0, uTexel.y), dC) ||
        selectedNeighbour(vUv - vec2(0.0, uTexel.y), dC);
      if (selectedEdge) {
        gl_FragColor = vec4(uSelectionColor, uSelectionOutlineOpacity);
        finishColor(); return;
      }
    }
    if (uMode == 0) discard;
    if (uMode == 1 && idC < 0.5) discard; // overlap halos land only on objects
    bool edge =
      occludedBy(vUv + vec2(uTexel.x, 0.0), idC, dC) ||
      occludedBy(vUv - vec2(uTexel.x, 0.0), idC, dC) ||
      occludedBy(vUv + vec2(0.0, uTexel.y), idC, dC) ||
      occludedBy(vUv - vec2(0.0, uTexel.y), idC, dC);
    if (!edge) discard;
    gl_FragColor = vec4(uColor, 1.0);
    finishColor();
  }
`

export function OutlinePass({ objects }: { objects?: Omit<Parameters<typeof selectionObjectId>[1], "piles"> }) {
  const { gl, scene } = useThree()

  // ID + depth buffer at drawing-buffer resolution. Nearest filtering is load-
  // bearing: interpolated ID colours would decode as phantom objects.
  const target = useMemo(() => {
    return new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthTexture: new THREE.DepthTexture(1, 1),
    })
  }, [])

  const characterTarget = useMemo(() => new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    type: THREE.HalfFloatType,
    generateMipmaps: false,
    depthTexture: new THREE.DepthTexture(1, 1),
  }), [])

  const displayTarget = useMemo(() => new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    generateMipmaps: false, depthTexture: new THREE.DepthTexture(1, 1),
  }), [])

  // Copy encoded world IDs without colour conversion, using exactly the same
  // crop/depth samples as the visible scenery. Then depth-test character IDs.
  const worldIds = useMemo(() => {
    const uniforms = {
      tId: { value: target.texture }, tDepth: { value: target.depthTexture },
      uScale: { value: new THREE.Vector2() }, uOffset: { value: new THREE.Vector2() },
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
    const material = new THREE.ShaderMaterial({
      uniforms, depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth, toneMapped: false,
      vertexShader: VERTEX_SHADER,
      fragmentShader: `varying vec2 vUv;
        uniform sampler2D tId; uniform sampler2D tDepth;
        uniform vec2 uScale; uniform vec2 uOffset;
        void main() {
          vec2 uv = (vUv - 0.5) * uScale + 0.5 + uOffset;
          gl_FragColor = texture2D(tId, uv);
          gl_FragDepth = texture2D(tDepth, uv).x;
        }`,
    })
    const scene = new THREE.Scene()
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    scene.add(mesh)
    return { uniforms, geometry, material, scene, camera: new THREE.Camera() }
  }, [target])

  useEffect(
    () => () => {
      target.depthTexture?.dispose()
      target.dispose()
      characterTarget.depthTexture?.dispose()
      characterTarget.dispose()
      displayTarget.depthTexture?.dispose()
      displayTarget.dispose()
      worldIds.geometry.dispose()
      worldIds.material.dispose()
    },
    [target, characterTarget, displayTarget, worldIds],
  )

  const pass = useMemo(() => {
    const uniforms = {
      tId: { value: null as THREE.Texture | null },
      tDepth: { value: null as THREE.Texture | null },
      tCharacter: { value: characterTarget.texture },
      tCharacterDepth: { value: characterTarget.depthTexture },
      uCharacterSelected: { value: false },
      uCharacterPass: { value: false },
      uCharacterIdMin: { value: MAX_OBJECT_ID - 0x2000 + 1 },
      uTexel: { value: new THREE.Vector2() },
      uMode: { value: 0 },
      uColor: { value: new THREE.Color(OUTLINE_COLOR) },
      uSelectedId: { value: 0 },
      uSelectionColor: { value: new THREE.Color(SELECTION_OUTLINE_COLOR) },
      uSelectionOutlineOpacity: { value: SELECTION_OUTLINE_OPACITY },
      uSelectionFill: { value: new THREE.Color(SELECTION_FILL) },
      uSelectionOpacity: { value: SELECTION_FILL_OPACITY },
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
      transparent: true,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    const quadScene = new THREE.Scene()
    quadScene.add(mesh)
    const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    return { uniforms, geometry, material, quadScene, quadCamera }
  }, [characterTarget])

  useEffect(
    () => () => {
      pass.geometry.dispose()
      pass.material.dispose()
    },
    [pass],
  )

  const prevClearColor = useMemo(() => new THREE.Color(), [])
  const bufferSize = useMemo(() => new THREE.Vector2(), [])

  const frameRef = usePixelScene((camera, destination, stage) => {
    const { outlineMode: mode, selection } = useCameraStore.getState()
    const requestedId = objects
      ? selectionObjectId(selection, { ...objects, piles: useBuildStore.getState().piles }) : 0
    const selectingCharacter = requestedId !== 0 && (selection?.kind === "monk" || selection?.kind === "traveler")
    const characterPass = stage.phase === "characters"
    const selectionInOtherPass = (stage.phase === "world" && selectingCharacter) || (characterPass && !selectingCharacter)
    const selectedId = selectionInOtherPass ? 0 : requestedId
    // The world ID/depth is also needed when only a character is selected.
    const needsOutline = mode !== "off" || requestedId !== 0
    const characterSelected = selectedId !== 0 && selectingCharacter
    const ids = characterPass ? displayTarget : target
    const background = scene.background
    const mask = camera.layers.mask
    const autoClear = gl.autoClear
    const previousTarget = gl.getRenderTarget()
    gl.getClearColor(prevClearColor)
    const clearAlpha = gl.getClearAlpha()
    try {
      gl.autoClear = false
      if (needsOutline) {
        if (destination) bufferSize.set(destination.width, destination.height)
        else gl.getDrawingBufferSize(bufferSize)
        ids.setSize(Math.max(1, bufferSize.x), Math.max(1, bufferSize.y))
        scene.background = null
        gl.setClearColor(0x000000, 1)
        gl.setRenderTarget(ids)
        gl.clear()
        if (characterPass) {
          worldIds.uniforms.uScale.value.copy(stage.scale)
          worldIds.uniforms.uOffset.value.copy(stage.offset)
          gl.render(worldIds.scene, worldIds.camera)
        }
        camera.layers.set(characterPass ? CHARACTER_ID_LAYER : OUTLINE_ID_LAYER)
        gl.render(scene, camera)
        if (characterSelected) {
          characterTarget.setSize(ids.width, ids.height)
          gl.setClearColor(0x000000, 0)
          camera.layers.set(SELECTED_CHARACTER_LAYER)
          gl.setRenderTarget(characterTarget)
          gl.clear()
          gl.render(scene, camera)
        }
      }
      camera.layers.mask = mask
      gl.setClearColor(prevClearColor, clearAlpha)
      scene.background = background
      gl.setRenderTarget(destination)
      if (!characterPass) gl.clear()
      gl.render(scene, camera)
      if (needsOutline) {
        pass.uniforms.tId.value = ids.texture
        pass.uniforms.tDepth.value = ids.depthTexture
        // One texel at each subject's own resolution: coarse scenery, fine figures.
        pass.uniforms.uTexel.value.set(1 / ids.width, 1 / ids.height)
        pass.uniforms.uMode.value = MODE_INT[mode]
        pass.uniforms.uSelectedId.value = selectedId
        pass.uniforms.uCharacterSelected.value = characterSelected
        pass.uniforms.uCharacterPass.value = characterPass
        gl.render(pass.quadScene, pass.quadCamera)
      }
    } finally {
      camera.layers.mask = mask
      scene.background = background
      gl.setClearColor(prevClearColor, clearAlpha)
      gl.autoClear = autoClear
      gl.setRenderTarget(previousTarget)
    }
  })

  useEffect(() => {
    outlineFrameRef.current = () => frameRef.current?.()
    return () => {
      outlineFrameRef.current = null
    }
  }, [frameRef])

  return null
}
