import { DoubleSide, MeshLambertMaterial } from 'three'

const compilePath: MeshLambertMaterial['onBeforeCompile'] = shader => {
  shader.vertexShader = 'varying vec3 previewPavingWorld;\n' + shader.vertexShader
  shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `
    #include <beginnormal_vertex>
    float levelGround = smoothstep(0.55, 0.95, objectNormal.y);
    objectNormal = normalize(mix(objectNormal, vec3(0.0, 1.0, 0.0), levelGround * 0.45));
  `)
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
    #include <begin_vertex>
    previewPavingWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  `)
  shader.fragmentShader = 'varying vec3 previewPavingWorld;\n' + shader.fragmentShader
  shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
    #include <color_fragment>
    // A continuous staggered grid across junctions, with joints painted onto the stone.
    vec2 slabSize = vec2(1.2, 1.8);
    vec2 metrePerPixel = max(fwidth(previewPavingWorld.xz), vec2(0.001));
    vec2 grid = previewPavingWorld.xz / slabSize;
    grid.x += 0.5 * mod(floor(grid.y), 2.0);
    vec2 cell = fract(grid);
    vec2 fromEdge = min(cell, 1.0 - cell) * slabSize;
    vec2 halfPixel = metrePerPixel * 0.5;
    vec2 joint = 1.0 - smoothstep(max(vec2(0.018) - halfPixel, vec2(0.0)),
      vec2(0.018) + halfPixel, fromEdge);
    joint *= min(vec2(1.0), vec2(0.036) / metrePerPixel);
    float resolveSlabs = 1.0 - smoothstep(0.25, 0.8, max(metrePerPixel.x, metrePerPixel.y));
    float stone = fract(dot(floor(grid), vec2(0.75487766, 0.56984029))) - 0.5;
    diffuseColor.rgb *= 1.0 + stone * 0.065 * resolveSlabs;
    diffuseColor.rgb *= 1.0 - max(joint.x, joint.y) * 0.15;
  `)
}

const pathProgramKey = () => 'park-renewal-preview-stone-paving'

export function createPreviewPathMaterial() {
  const material = new MeshLambertMaterial({ color: '#d8cfb8', side: DoubleSide })
  material.onBeforeCompile = compilePath
  material.customProgramCacheKey = pathProgramKey
  return material
}
