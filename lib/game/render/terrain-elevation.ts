/** Deform the tile tops identically in the colour and outline depth passes. */
export function elevationShader(shader: { vertexShader: string }, cuts = true): void {
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `attribute vec4 aCorners;
attribute vec4 aSurface;
${cuts ? "attribute float aCut;" : ""}
#include <common>`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>
      ${cuts ? `
      if (abs(aCut) > .5) {
        float corner = abs(aCut) - 1.0;
        vec2 direction = vec2(corner < 2.0 ? 1.0 : -1.0, mod(corner, 2.0) < .5 ? 1.0 : -1.0) * sign(aCut);
        if (position.x * direction.x > .49 && position.z * direction.y > .49) transformed.x = -direction.x * .5;
      }` : ""}
      float terrainTop = mix(mix(aCorners.x, aCorners.y, transformed.x + 0.5),
        mix(aCorners.z, aCorners.w, transformed.x + 0.5), transformed.z + 0.5) + 0.2;
      transformed.y = position.y < 0.0 ? -0.5 : (terrainTop - instanceMatrix[3].y) / instanceMatrix[1].y;
      float face = normal.x > 0.5 ? 1.0 : normal.x < -0.5 ? 2.0 : normal.z > 0.5 ? 4.0 : 8.0;
      float hiddenFaces = floor(aSurface.y / 2.0);
      if (normal.y < -0.5 || (abs(normal.y) < 0.5 && mod(floor(hiddenFaces / face), 2.0) > 0.5)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    `)
    .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
      ${cuts ? `
      if (abs(aCut) > .5 && abs(normal.x) > .5) {
        float corner = abs(aCut) - 1.0;
        vec2 direction = vec2(corner < 2.0 ? 1.0 : -1.0, mod(corner, 2.0) < .5 ? 1.0 : -1.0) * sign(aCut);
        if (normal.x * direction.x > .5) objectNormal = normalize(vec3(direction.x, 0.0, direction.y));
      }` : ""}
      if (normal.y > 0.5) {
        float gx = mix(aCorners.y - aCorners.x, aCorners.w - aCorners.z, position.z + 0.5);
        float gz = mix(aCorners.z - aCorners.x, aCorners.w - aCorners.y, position.x + 0.5);
        objectNormal = normalize(vec3(-gx, instanceMatrix[1].y, -gz));
      }
    `)
}

