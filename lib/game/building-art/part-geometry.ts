import * as THREE from "three"
import type { BuildingPart } from "./geometry"
import { DEFAULT_ROAD_LOOK, ROAD_TIERS } from "../map/road"

import { GROUND_SURFACE_GLSL, ROAD_UV_SCALE } from "../render/ground-surface"
import { DIRT_FLOOR_OVERLAP } from "./dirt-floor"

export const BUILDING_DIRT_TEXTURE = ROAD_TIERS[0].textureUrl

export function configureBuildingDirt(texture: THREE.Texture) {
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestMipmapLinearFilter
  return texture
}

/** Ground previews add a thin apron; in-game floors remain footprint-sized click targets. */
export function buildingPartGeometry(part: BuildingPart, previewApron = true) {
  if (part.surface === "trail" && part.size && previewApron) {
    return new THREE.PlaneGeometry(part.size[0]+DIRT_FLOOR_OVERLAP*2, part.size[2]+DIRT_FLOOR_OVERLAP*2)
      .rotateX(-Math.PI/2).translate(0,part.size[1]/2,0)
  }
  const geometry = part.size ? new THREE.BoxGeometry(...part.size)
    : new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(part.vertices!, 3))
  geometry.computeVertexNormals()
  return geometry
}

/** Standalone previews use the same trail/grass composite as the terrain renderer. */
export function dirtFloorMaterial(part: BuildingPart, trail: THREE.Texture, grass: THREE.Texture) {
  const material = new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })
  material.onBeforeCompile = shader => {
    shader.uniforms.trailMap = { value: trail }
    shader.uniforms.grassMap = { value: grass }
    shader.uniforms.swardField = { value: null }
    shader.uniforms.swardFieldSize = { value: new THREE.Vector2() }
    shader.uniforms.swardFieldOrigin = { value: new THREE.Vector2() }
    shader.uniforms.floorHalfSize = { value: new THREE.Vector2(part.size![0]/2, part.size![2]/2) }
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "varying vec2 vFloorLocal; varying vec2 vFloorWorld;\n#include <common>")
      .replace("#include <project_vertex>", `#include <project_vertex>
        vFloorLocal = position.xz;
        vFloorWorld = (modelMatrix * vec4(position, 1.0)).xz;`)
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `
      varying vec2 vFloorLocal;
      varying vec2 vFloorWorld;
      uniform sampler2D trailMap;
      uniform sampler2D grassMap;
      uniform vec2 floorHalfSize;
      ${GROUND_SURFACE_GLSL}
      #include <common>`)
      .replace("#include <color_fragment>", `
        vec2 q = abs(vFloorLocal) - floorHalfSize;
        float d = length(max(q,0.0)) + min(max(q.x,q.y),0.0);
        float rough = tileNoise(vFloorWorld * 3.7) * .65 + tileNoise(vFloorWorld * 8.3) * .35;
        float edge = .025 + ${DIRT_FLOOR_OVERLAP-.025} * rough;
        float aa = max(fwidth(d), .001);
        diffuseColor.a *= 1.0-smoothstep(edge-aa*.5,edge+aa*.5,d);
        vec4 dirt = sampleTiled(trailMap, vFloorWorld * ${ROAD_UV_SCALE}, vFloorWorld);
        vec3 sward = sampleSward(grassMap, vFloorWorld);
        diffuseColor.rgb *= mix(sward, roadSurfaceColor(dirt, ${DEFAULT_ROAD_LOOK.shade.toFixed(1)}, vec4(0.0), vec3(1.0)), dirt.a * ${DEFAULT_ROAD_LOOK.opacity.toFixed(1)});
      `)
  }
  material.customProgramCacheKey = () => "building-trail-preview-growth-v2"
  return material
}
