"use client"

import { useEffect, useMemo } from "react"
import { useThree } from "@react-three/fiber"
import * as THREE from "three"
import { usePixelScene } from "@/components/pixel-canvas"
import { CHARACTER_COLOR_LAYER, CHARACTER_ID_LAYER } from "@/lib/game/render/pixel-characters"
import { characterOcclusionRequest, sampleCharacterOcclusion } from "@/lib/game/render/character-occlusion"
import { sceneryCloseOpacity, sceneryDetail, treeEdgeOpacity } from "@/lib/game/render/scenery-detail"

import { useCameraStore, type Selection } from "@/lib/game/camera-store"
import { useBuildStore } from "@/lib/game/build-store"
import { COMPANION_OUTLINE_OPACITY, SELECTION_OUTLINE_COLOR, SELECTION_OUTLINE_OPACITY, SELECTION_FILL, SELECTION_FILL_OPACITY, selectionObjectId } from "@/lib/game/selection"
import { simRegistry } from "@/lib/game/sim"
import {
  OUTLINE_ID_LAYER,
  ROAD_EDGE_LAYER,
  SELECTED_CHARACTER_LAYER,
  MAX_OBJECT_ID,
  RELIC_OBJECT_ID,
  type OutlineMode,
} from "@/lib/game/render/outline"

/** Warm near-black, so lines read as ink rather than dead pixels. */
const OUTLINE_COLOR = "#120b05"

/**
 * How much of a person shows through the tree hiding them. Half strength keeps
 * the trunk or crown in front readable while the walker behind stays followable
 * — the same masking the selected character already gets behind any occluder.
 */
const CHARACTER_MASK_OPACITY = 0.5

/**
 * How strongly the road's edge line comes back through the canopy. Much
 * fainter than the line on the open road — enough to follow where the road
 * runs under the trees, never enough to read as a line drawn on them.
 */
const ROAD_EDGE_MASK_OPACITY = 0.5

const MODE_INT: Record<OutlineMode, number> = { off: 0, overlap: 1, silhouette: 2 }

/**
 * The scene, re-rendered each frame so the debug handle can composite the same
 * frame the player sees into its screenshots.
 */
export const outlineFrameRef: { current: (() => void) | null } = { current: null }

/**
 * The world pass's object IDs, one texel per world texel, for the view
 * snapshot to cut its picture along whole objects. Set `wanted` before a frame
 * so the IDs are drawn even when no outline needs them; `read` then returns
 * RGBA bytes for a region in buffer texels, rows from the bottom.
 */
export const worldObjectIds: { wanted: boolean; read: ((x: number, y: number, width: number, height: number) => Uint8Array | null) | null } = { wanted: false, read: null }

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
 * eating into it. Overlap mode also traces buildings against the terrain
 * behind them; other scenery keeps only its object-overlap edges.
 */
const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D tId;
  uniform sampler2D tDepth;
  uniform sampler2D tCharacter;
  uniform sampler2D tCharacterDepth;
  uniform sampler2D tMasked;
  uniform sampler2D tMaskedDepth;
  uniform sampler2D tRoadEdge;
  uniform bool uMapReveal;
  uniform bool uRoadEdges;
  uniform float uRoadEdgeOpacity;
  uniform bool uMaskCharacters;
  uniform float uMaskOpacity;
  uniform float uTreeIdMin;
  uniform float uTreeIdMax;
  uniform float uTreeEdgeOpacity;
  uniform float uCharacterEdgeOpacity;
  uniform bool uCharacterSelected;
  uniform bool uCharacterPass;
  uniform float uCharacterIdMin;
  uniform float uAnimalIdMin;
  uniform float uAnimalIdMax;
  uniform vec2 uTexel;
  uniform int uMode; // 1 = overlap only, 2 = full silhouette
  uniform vec3 uColor;
  uniform float uSelectedId;
  uniform float uCompanionIds[20];
  uniform int uCompanionCount;
  uniform float uCompanionOpacity;
  uniform vec3 uSelectionColor;
  uniform float uSelectionOutlineOpacity;
  uniform vec3 uSelectionFill;
  uniform float uSelectionOpacity;
  varying vec2 vUv;
  float revealOpacity = 1.0;

  void finishColor() {
    if (uMapReveal) gl_FragColor.a *= revealOpacity;
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
    // Buildings occupy IDs 1 through uTreeIdMin - 1, including player-built
    // structures. Let their back edges read against terrain in overlap mode.
    if (uMode == 1 && idC < 0.5 && idN >= uTreeIdMin) return false;
    // Distant trees neither receive nor cast ordinary overlap ink. Selection
    // uses its own neighbour test and remains visible at every distance.
    if (uTreeEdgeOpacity <= 0.0 && ((idC >= uTreeIdMin && idC <= uTreeIdMax)
      || (idN >= uTreeIdMin && idN <= uTreeIdMax))) return false;
    // Scenery-only edges already exist in the enlarged world image.
    if (uCharacterPass && idC < uCharacterIdMin && idN < uCharacterIdMin) return false;
    float dN = texture2D(tDepth, uv).x;
    bool nearer = dN < dC - 1.0e-5;
    if (nearer && uMapReveal) revealOpacity = min(revealOpacity, texture2D(tId, uv).a);
    return nearer;                         // neighbour must be in front
  }

  bool animalBorder(vec2 uv, float idC, float dC) {
    return abs(idAt(uv) - idC) > .5 && texture2D(tDepth, uv).x > dC + 1.0e-5;
  }

  bool selectedNeighbour(vec2 uv, float dC) {
    return abs(idAt(uv) - uSelectedId) < 0.5
      && texture2D(tDepth, uv).x < dC - 1.0e-5;
  }

  bool companion(float id) {
    if (id < uCharacterIdMin) return false;
    for (int i = 0; i < 20; i++) {
      if (i >= uCompanionCount) break;
      if (abs(id - uCompanionIds[i]) < 0.5) return true;
    }
    return false;
  }

  bool companionNeighbour(vec2 uv, float dC) {
    return texture2D(tDepth, uv).x < dC - 1.0e-5 && companion(idAt(uv));
  }

  void main() {
    // IDs and depth already match the visible raster in each pass. Snapping
    // display-resolution characters to scenery texel centres moves their edges
    // away from the sprite and can paint ink across an occluding wall.
    // Keep the sample on the visible pixel; uTexel still sets one world-pixel
    // border width, just as it does for trees and buildings.
    vec2 pixelUv = vUv;
    if (uMapReveal) revealOpacity = texture2D(tId, pixelUv).a;
    float idC = idAt(pixelUv);
    float dC = texture2D(tDepth, pixelUv).x;
    if (uCharacterSelected) {
      vec4 character = texture2D(tCharacter, pixelUv);
      if (character.a > 0.5) {
        bool hidden = abs(idC - uSelectedId) > 0.5
          && texture2D(tCharacterDepth, pixelUv).x > dC + 1.0e-5;
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
        texture2D(tCharacter, pixelUv + vec2(uTexel.x, 0.0)).a > 0.5 ||
        texture2D(tCharacter, pixelUv - vec2(uTexel.x, 0.0)).a > 0.5 ||
        texture2D(tCharacter, pixelUv + vec2(0.0, uTexel.y)).a > 0.5 ||
        texture2D(tCharacter, pixelUv - vec2(0.0, uTexel.y)).a > 0.5;
      if (characterEdge) {
        gl_FragColor = vec4(uSelectionColor, uSelectionOutlineOpacity);
        finishColor(); return;
      }
    }
    // Trees give way to the people walking behind them: where an unoccluded
    // character sits behind a trunk or a crown, the figure returns at half
    // strength. Only trees relent — terrain writes ID 0 and buildings own
    // their own ID block, so hills and walls still hide whoever is behind.
    if (uMaskCharacters && idC >= uTreeIdMin && idC <= uTreeIdMax) {
      vec4 masked = texture2D(tMasked, pixelUv);
      if (masked.a > 0.5 && texture2D(tMaskedDepth, pixelUv).x > dC + 1.0e-5) {
        gl_FragColor = vec4(masked.rgb, uMaskOpacity);
        finishColor(); return;
      }
    }
    // The road keeps its verge through the wood: the edge line, drawn over the
    // terrain's own depth, comes back in ink wherever a tree stands in front of
    // it, so a road's course still reads under the canopy.
    if (uRoadEdges && idC >= uTreeIdMin && idC <= uTreeIdMax) {
      float verge = texture2D(tRoadEdge, pixelUv).r;
      if (verge > 0.004) {
        gl_FragColor = vec4(uColor, verge * uRoadEdgeOpacity);
        finishColor(); return;
      }
    }
    if (!uCharacterSelected && uSelectedId > 0.5 && abs(idC - uSelectedId) < 0.5) {
      gl_FragColor = vec4(uSelectionFill, uSelectionOpacity);
      finishColor(); return;
    }
    // The halo belongs outside the shape, on its background side only.
    // Nearer objects still hide the selected object and its highlight.
    if (!uCharacterSelected && uSelectedId > 0.5) {
      bool selectedEdge =
        selectedNeighbour(pixelUv + vec2(uTexel.x, 0.0), dC) ||
        selectedNeighbour(pixelUv - vec2(uTexel.x, 0.0), dC) ||
        selectedNeighbour(pixelUv + vec2(0.0, uTexel.y), dC) ||
        selectedNeighbour(pixelUv - vec2(0.0, uTexel.y), dC);
      if (selectedEdge) {
        gl_FragColor = vec4(uSelectionColor, uSelectionOutlineOpacity);
        finishColor(); return;
      }
    }
    // Reuse visible IDs: companions get a quieter edge, with no selection fill
    // or extra scene render. Foreground people and scenery still occlude it.
    if (uCompanionCount > 0 && !companion(idC)) {
      bool companionEdge =
        companionNeighbour(pixelUv + vec2(uTexel.x, 0.0), dC) ||
        companionNeighbour(pixelUv - vec2(uTexel.x, 0.0), dC) ||
        companionNeighbour(pixelUv + vec2(0.0, uTexel.y), dC) ||
        companionNeighbour(pixelUv - vec2(0.0, uTexel.y), dC);
      if (companionEdge) {
        gl_FragColor = vec4(uSelectionColor, uCompanionOpacity);
        finishColor(); return;
      }
    }
    // Live wildlife have no baked sprite ink. Shade one native pixel inside
    // their visible silhouette, retaining the coat color under a tonal border.
    // This uses the existing world IDs and respects foreground occluders.
    if (!uCharacterPass && idC >= uAnimalIdMin && idC <= uAnimalIdMax) {
      bool animalEdge = animalBorder(pixelUv + vec2(uTexel.x, 0.0), idC, dC)
        || animalBorder(pixelUv - vec2(uTexel.x, 0.0), idC, dC)
        || animalBorder(pixelUv + vec2(0.0, uTexel.y), idC, dC)
        || animalBorder(pixelUv - vec2(0.0, uTexel.y), idC, dC);
      if (animalEdge) { gl_FragColor = vec4(uColor, .38); finishColor(); return; }
    }
    if (uMode == 0) discard;
    if (idC >= uTreeIdMin && idC <= uTreeIdMax && uTreeEdgeOpacity <= 0.0) discard;
    bool edge =
      occludedBy(pixelUv + vec2(uTexel.x, 0.0), idC, dC) ||
      occludedBy(pixelUv - vec2(uTexel.x, 0.0), idC, dC) ||
      occludedBy(pixelUv + vec2(0.0, uTexel.y), idC, dC) ||
      occludedBy(pixelUv - vec2(0.0, uTexel.y), idC, dC);
    if (!edge) discard;
    // At a wide view the dense canopy should read as a forest. Keep tree IDs
    // and depth for selection/occlusion, but fade the fine overlap ink.
    float opacity = idC >= uTreeIdMin && idC <= uTreeIdMax ? uTreeEdgeOpacity : 1.0;
    gl_FragColor = vec4(uColor, opacity * (uCharacterPass ? uCharacterEdgeOpacity : 1.0));
    finishColor();
  }
`

export function OutlinePass({ objects, selection: previewSelection }: { selection?: Selection | null; objects?: Omit<Parameters<typeof selectionObjectId>[1], "piles"> }) {
  const { gl, scene, camera: displayCamera, size } = useThree()

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

  // The road's edge line over the terrain's depth alone: no trees, no
  // buildings, so what a crown hides is still in the buffer. Coverage lands in
  // the red channel, so the terrain's black ID copy reads as "no line here".
  const roadEdgeTarget = useMemo(() => new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false,
  }), [])

  // Every character drawn on its own, free of the world's depth, so the
  // composite can put the hidden part of a walker back over the trees.
  const maskTarget = useMemo(() => new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    type: THREE.HalfFloatType,
    generateMipmaps: false,
    depthTexture: new THREE.DepthTexture(1, 1),
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
      maskTarget.depthTexture?.dispose()
      maskTarget.dispose()
      roadEdgeTarget.dispose()
      worldIds.geometry.dispose()
      worldIds.material.dispose()
    },
    [target, characterTarget, displayTarget, maskTarget, roadEdgeTarget, worldIds],
  )

  const pass = useMemo(() => {
    const uniforms = {
      tId: { value: null as THREE.Texture | null },
      tDepth: { value: null as THREE.Texture | null },
      tCharacter: { value: characterTarget.texture },
      tCharacterDepth: { value: characterTarget.depthTexture },
      tMasked: { value: maskTarget.texture },
      tMaskedDepth: { value: maskTarget.depthTexture },
      tRoadEdge: { value: roadEdgeTarget.texture },
      uRoadEdges: { value: false },
      uRoadEdgeOpacity: { value: ROAD_EDGE_MASK_OPACITY },
      uMaskCharacters: { value: false },
      uMaskOpacity: { value: CHARACTER_MASK_OPACITY },
      // Trees own the ID block between the buildings and the relic.
      uTreeIdMin: { value: 1 },
      uTreeIdMax: { value: RELIC_OBJECT_ID - 1 },
      uTreeEdgeOpacity: { value: 1 },
      uCharacterEdgeOpacity: { value: 1 },
      uCharacterSelected: { value: false },
      uCharacterPass: { value: false },
      uCharacterIdMin: { value: MAX_OBJECT_ID - 0x2000 + 1 },
      uAnimalIdMin: { value: MAX_OBJECT_ID - 0x5000 + 1 },
      uAnimalIdMax: { value: MAX_OBJECT_ID - 0x4000 },
      uTexel: { value: new THREE.Vector2() },
      uMode: { value: 0 },
      uColor: { value: new THREE.Color(OUTLINE_COLOR) },
      uSelectedId: { value: 0 },
      uCompanionIds: { value: new Float32Array(20) },
      uCompanionCount: { value: 0 },
      uCompanionOpacity: { value: COMPANION_OUTLINE_OPACITY },
      uSelectionColor: { value: new THREE.Color(SELECTION_OUTLINE_COLOR) },
      uSelectionOutlineOpacity: { value: SELECTION_OUTLINE_OPACITY },
      uSelectionFill: { value: new THREE.Color(SELECTION_FILL) },
      uSelectionOpacity: { value: SELECTION_FILL_OPACITY },
      uMapReveal: { value: false },
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
  }, [characterTarget, maskTarget, roadEdgeTarget])

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
    const { outlineMode, selection: worldSelection } = useCameraStore.getState()
    const selection = previewSelection === undefined ? worldSelection : previewSelection
    const requestedId = objects
      ? selectionObjectId(selection, { ...objects, piles: useBuildStore.getState().piles }) : 0
    const selectingCharacter = requestedId !== 0 && (selection?.kind === "monk" || selection?.kind === "traveler")
    const characterPass = stage.phase === "characters"
    const detail = sceneryDetail(scene)
    const distant = detail > 0
    const closeOpacity = sceneryCloseOpacity(scene)
    // At the farthest view, authored building lines and sprite colors are
    // sufficient. Selection still requests its IDs, but ordinary overlap ink
    // must not require another complete terrain/building/tree scene pass.
    const mode = detail === 2 || (characterPass && closeOpacity === 0) ? "off" : outlineMode
    const selectionInOtherPass = (stage.phase === "world" && selectingCharacter) || (characterPass && !selectingCharacter)
    const selectedId = selectionInOtherPass ? 0 : requestedId
    // Wide views use ordinary depth occlusion. Dropping the see-through masks
    // removes the extra character colour and road-edge scene renders entirely.
    const maskCharacters = closeOpacity > 0 && stage.hasCharacters
    // Trees hide the roads under them in the same pass they are drawn in.
    const roadEdgePass = !characterPass && !distant
    const maskPass = characterPass && maskCharacters
    const characterSelected = selectedId !== 0 && selectingCharacter
    const needsOutline = mode !== "off" || selectedId !== 0 || maskPass || roadEdgePass
    // Selection and one-shot diagnostics still need the matching world depth.
    // With no distant selection the character stage draws only its real colour.
    const needsIds = needsOutline || !!characterOcclusionRequest.current
      || (stage.phase === "world" && (maskCharacters || selectingCharacter || worldObjectIds.wanted))
    const ids = characterPass ? displayTarget : target
    const background = scene.background
    const mask = camera.layers.mask
    const autoClear = gl.autoClear
    const previousTarget = gl.getRenderTarget()
    gl.getClearColor(prevClearColor)
    const clearAlpha = gl.getClearAlpha()
    try {
      gl.autoClear = false
      if (needsIds) {
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
        if (roadEdgePass) {
          roadEdgeTarget.setSize(ids.width, ids.height)
          gl.setClearColor(0x000000, 0)
          camera.layers.set(ROAD_EDGE_LAYER)
          gl.setRenderTarget(roadEdgeTarget)
          gl.clear()
          gl.render(scene, camera)
        }
        if (maskPass) {
          maskTarget.setSize(ids.width, ids.height)
          gl.setClearColor(0x000000, 0)
          camera.layers.set(CHARACTER_COLOR_LAYER)
          gl.setRenderTarget(maskTarget)
          gl.clear()
          gl.render(scene, camera)
        }
      }
      if (characterPass && characterOcclusionRequest.current) {
        const resolve = characterOcclusionRequest.current
        characterOcclusionRequest.current = null
        resolve(sampleCharacterOcclusion(gl, scene, camera, ids))
      }
      camera.layers.mask = mask
      gl.setClearColor(prevClearColor, clearAlpha)
      scene.background = background
      gl.setRenderTarget(destination)
      if (!characterPass) gl.clear()
      gl.render(scene, camera)
      if (needsOutline) {
        pass.uniforms.uMapReveal.value = scene.userData.mapRevealActive === true
        pass.uniforms.tId.value = ids.texture
        pass.uniforms.tDepth.value = ids.depthTexture
        // One world texel for every border, including display-resolution figures.
        // The crop converts the world buffer's texel size to display UVs, keeping
        // selections and overlap halos equally thick through zoom and DPR changes.
        if (characterPass) {
          pass.uniforms.uTexel.value.set(1 / (target.width * stage.scale.x), 1 / (target.height * stage.scale.y))
        } else {
          pass.uniforms.uTexel.value.set(1 / ids.width, 1 / ids.height)
        }
        pass.uniforms.uMode.value = MODE_INT[mode]
        pass.uniforms.uSelectedId.value = selectedId
        const sim = simRegistry.current
        const partyId = selection?.kind === "traveler" ? sim?.travelers.get(selection.id)?.partyId : undefined
        const companions = characterPass && partyId !== undefined ? sim?.parties.get(partyId)?.members ?? [] : []
        let companionCount = 0
        if (objects) for (const id of companions) {
          if (selection?.kind === "traveler" && id === selection.id) continue
          const objectId = selectionObjectId({ kind: "traveler", id }, { ...objects, piles: [] })
          if (objectId && companionCount < 20) pass.uniforms.uCompanionIds.value[companionCount++] = objectId
        }
        pass.uniforms.uCompanionCount.value = companionCount
        pass.uniforms.uCharacterSelected.value = characterSelected
        pass.uniforms.uCharacterPass.value = characterPass
        pass.uniforms.uMaskCharacters.value = maskPass
        pass.uniforms.uRoadEdges.value = roadEdgePass
        pass.uniforms.uTreeIdMin.value = (objects?.buildings.length ?? 0) + 1
        pass.uniforms.uTreeEdgeOpacity.value = distant ? 0 : treeEdgeOpacity(displayCamera, size.height)
        pass.uniforms.uCharacterEdgeOpacity.value = closeOpacity
        pass.uniforms.uMaskOpacity.value = CHARACTER_MASK_OPACITY * closeOpacity
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
    worldObjectIds.read = (x, y, width, height) => {
      if (x < 0 || y < 0 || x + width > target.width || y + height > target.height) return null
      const pixels = new Uint8Array(width * height * 4)
      gl.readRenderTargetPixels(target, x, y, width, height, pixels)
      return pixels
    }
    return () => { worldObjectIds.read = null }
  }, [gl, target])
  useEffect(() => {
    outlineFrameRef.current = () => frameRef.current?.()
    return () => {
      outlineFrameRef.current = null
    }
  }, [frameRef])

  return null
}
