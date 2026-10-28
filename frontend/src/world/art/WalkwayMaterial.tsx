import type { MeshLambertMaterial } from 'three'

// Keep the low-poly Lambert lighting and existing ground triangles. Metre-sized
// slabs need no image maps, extra meshes, normal maps or per-frame JS updates.
const compilePaving: MeshLambertMaterial['onBeforeCompile'] = (shader) => {
  shader.vertexShader = `varying vec3 vPavingWorld;\n${shader.vertexShader}`
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
    vPavingWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
  )
  shader.fragmentShader = `varying vec3 vPavingWorld;\n${shader.fragmentShader}`
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <color_fragment>',
    `#include <color_fragment>
    // World coordinates keep slabs aligned across overlapping route strips,
    // curves and junctions. The grid also follows the sloping fountain plaza.
    vec2 pavingUv = vPavingWorld.xz / vec2(1.2, 1.8);
    pavingUv.x += mod(floor(pavingUv.y), 2.0) * 0.5;
    vec2 slab = floor(pavingUv);
    vec2 cell = fract(pavingUv);
    vec2 edgeDistance = min(cell, 1.0 - cell) * vec2(1.2, 1.8);
    // Differentiate the continuous coordinates, before the staggered row jump.
    vec2 aa = max(fwidth(vPavingWorld.xz), vec2(0.001));
    vec2 joint = 1.0 - smoothstep(vec2(0.009), vec2(0.009) + aa, edgeDistance);
    float grout = max(joint.x, joint.y);
    float variation = fract(dot(slab, vec2(0.75487766, 0.56984029)));
    float distanceToEye = distance(cameraPosition, vPavingWorld);
    float detailFade = 1.0 - smoothstep(18.0, 55.0, distanceToEye);
    // Fade undersampled joints as well as distant ones to avoid shimmer at
    // shallow camera angles and at the low quality setting's reduced resolution.
    detailFade *= 1.0 - smoothstep(0.08, 0.3, max(aa.x, aa.y));
    diffuseColor.rgb *= 1.0 + (variation - 0.5) * 0.10 * detailFade;
    diffuseColor.rgb *= 1.0 - grout * 0.19 * detailFade;`,
  )
}
const pavingProgramKey = () => 'park-walkway-lambert-v1'

/** Reserved for horizontal paving; other park props keep solid matte finishes. */
export function WalkwayMaterial({ color = '#c9c1ab' }: { color?: string }) {
  return (
    <meshLambertMaterial
      color={color}
      polygonOffset
      polygonOffsetFactor={0}
      polygonOffsetUnits={-1}
      onBeforeCompile={compilePaving}
      customProgramCacheKey={pavingProgramKey}
      userData={{ paving: true }}
    />
  )
}
