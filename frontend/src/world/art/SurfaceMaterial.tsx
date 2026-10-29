import { SIMPLE_MAP } from './mapRenderProfile'
import { useLayoutEffect, useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import {
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type MeshStandardMaterial,
  type Side,
  type Texture,
} from 'three'
import { surfaceMapUrls, type Surface } from '../worldAssets'

export type { Surface } from '../worldAssets'
const configured = new WeakSet<Texture>()

/** Shared, local CC0 detail maps; no per-instance textures or runtime CDN calls. */
export function useSurfaceMaps(kind: Surface) {
  const maps = useLoader(TextureLoader, SIMPLE_MAP ? [] : surfaceMapUrls[kind])
  return useMemo(() => {
    maps.forEach((map, i) => {
      if (configured.has(map)) return
      map.wrapS = map.wrapT = RepeatWrapping
      map.anisotropy = 4
      if (i === 0) map.colorSpace = SRGBColorSpace
      map.needsUpdate = true
      configured.add(map)
    })
    return { map: maps[0] ?? null, normalMap: maps[1] ?? null, roughnessMap: maps[2] ?? null }
  }, [maps])
}

/** Box projection uses each instance's dimensions, so a long wall doesn't stretch one tile. */
function DetailedSurfaceMaterial({
  kind,
  mapping = 'uv',
  meters = 1.5,
  color = '#ffffff',
  strength = 0.45,
  detail = 1,
  side = 0,
  vertexColors = false,
  depthOffset = false,
  paving = false,
  baked = false,
}: {
  kind: Surface
  mapping?: 'uv' | 'box'
  meters?: number
  color?: string
  strength?: number
  detail?: number
  side?: Side
  vertexColors?: boolean
  depthOffset?: boolean
  paving?: boolean
  baked?: boolean
}) {
  const maps = useSurfaceMaps(kind)
  const uniforms = useMemo(
    () => ({
      detail: { value: detail },
      meters: { value: meters },
    }),
    [],
  )
  useLayoutEffect(() => {
    uniforms.detail.value = detail
    uniforms.meters.value = meters
  }, [uniforms, detail, meters])
  const programKey = `park-surface-v6-${kind}-${mapping}-${paving}-${baked}`
  const compile = useMemo<MeshStandardMaterial['onBeforeCompile']>(
    () => (shader) => {
      shader.uniforms.surfaceDetail = uniforms.detail
      shader.fragmentShader = `uniform float surfaceDetail;\n${shader.fragmentShader}`
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        'vec3 surfaceTint = diffuseColor.rgb;\n#include <map_fragment>\ndiffuseColor.rgb = mix(surfaceTint, diffuseColor.rgb, surfaceDetail);',
      )
      if (baked) {
        shader.vertexShader = `attribute vec2 surfaceFinish; varying vec2 vSurfaceFinish;\n${shader.vertexShader}`
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvSurfaceFinish = surfaceFinish;',
        )
        shader.fragmentShader = `varying vec2 vSurfaceFinish;\n${shader.fragmentShader}`
        shader.fragmentShader = shader.fragmentShader.replace(
          'mix(surfaceTint, diffuseColor.rgb, surfaceDetail)',
          'mix(surfaceTint, diffuseColor.rgb, vSurfaceFinish.y)',
        )
        // normal_fragment_maps is a shader include. Scale its normalScale uniform
        // through a macro only while expanding that chunk.
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <normal_fragment_maps>',
          '#define normalScale vec2(vSurfaceFinish.x)\n#include <normal_fragment_maps>\n#undef normalScale',
        )
      }
      if (kind !== 'grass') {
        // Broad, continuous mottling breaks repetition without subpixel noise.
        shader.vertexShader = `varying vec3 vSurfaceWorld;\n${shader.vertexShader}`
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec4 surfaceWorld = vec4(position, 1.);
          #ifdef USE_INSTANCING
            surfaceWorld = instanceMatrix * surfaceWorld;
          #endif
          vSurfaceWorld = (modelMatrix * surfaceWorld).xyz;`,
        )
        shader.fragmentShader = `varying vec3 vSurfaceWorld;\n${shader.fragmentShader}`
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float weathering = sin(vSurfaceWorld.x * 1.7 + sin(vSurfaceWorld.z * .83))
            * sin(vSurfaceWorld.y * 2.1 + vSurfaceWorld.z * 1.23);
          diffuseColor.rgb *= 1. + weathering * ${kind === 'bark' ? '.07' : '.045'};`,
        )
      }
      if (paving) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec2 blockUv = vMapUv / vec2(.8,.8);
          // Square granite slabs and four-metre modular border bands.
          vec2 cell = fract(blockUv);
          vec2 aa = max(fwidth(blockUv),vec2(.008));
          vec2 edge = smoothstep(vec2(.018),vec2(.018)+aa,cell) * (1.-smoothstep(vec2(.982)-aa,vec2(.982),cell));
          float grout = 1.-edge.x*edge.y;
          float variation = fract(sin(dot(floor(blockUv),vec2(12.9898,78.233)))*43758.5453);
          diffuseColor.rgb *= mix(.9,1.06,variation);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*.55,grout*.7);
          vec2 moduleUv = abs(fract(vMapUv / 4.) - .5) * 4.;
          float borderDistance = max(moduleUv.x, moduleUv.y);
          float bandAA = max(fwidth(borderDistance), .004);
          float band = smoothstep(1.55-bandAA,1.55+bandAA,borderDistance) * (1.-smoothstep(1.72-bandAA,1.72+bandAA,borderDistance));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(.65,.69,.73),band*.65);
        `,
        )
      }
      if (mapping === 'box') {
        shader.uniforms.surfaceMeters = uniforms.meters
        shader.vertexShader = `uniform float surfaceMeters;\n${shader.vertexShader}`
        shader.vertexShader = shader.vertexShader.replace(
          '#include <uv_vertex>',
          `
        #include <uv_vertex>
        vec3 surfaceScale = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
        vec2 surfaceOffset = vec2(0.);
        #ifdef USE_INSTANCING
          surfaceScale *= vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          surfaceOffset = instanceMatrix[3].xz * .173;
        #endif
        vec3 surfacePoint = position * surfaceScale;
        vec3 face = abs(normal);
        vec2 surfaceUv, surfaceSpan;
        if(face.y >= face.x && face.y >= face.z) {
          surfaceUv = surfacePoint.xz; surfaceSpan = surfaceScale.xz;
        } else if(face.x > face.z) {
          surfaceUv = surfacePoint.zy; surfaceSpan = surfaceScale.zy;
        } else {
          surfaceUv = surfacePoint.xy; surfaceSpan = surfaceScale.xy;
        }
        ${kind === 'wood' ? 'if(surfaceSpan.x > surfaceSpan.y) surfaceUv = surfaceUv.yx;' : ''}
        surfaceUv = surfaceUv / surfaceMeters + surfaceOffset;
        vMapUv = surfaceUv;
        vNormalMapUv = surfaceUv;
        vRoughnessMapUv = surfaceUv;
      `,
        )
      }
      // Outdoor surfaces are matte, including the worn wood's brightest grain.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor, ${kind === 'wood' ? '0.58, 0.9' : kind === 'stone' ? '0.76, 0.98' : '0.84, 1.0'});`,
      )
    },
    [kind, mapping, uniforms, paving, baked],
  )
  return (
    <meshStandardMaterial
      key={programKey}
      {...maps}
      color={color}
      side={side}
      normalScale={[strength, strength]}
      roughness={1}
      vertexColors={vertexColors}
      polygonOffset={depthOffset}
      polygonOffsetFactor={0}
      polygonOffsetUnits={-1}
      onBeforeCompile={compile}
      // Uniform values do not change shader source. Share the compiled program.
      customProgramCacheKey={() => programKey}
    />
  )
}

export function SurfaceMaterial(props:Parameters<typeof DetailedSurfaceMaterial>[0]){
  return SIMPLE_MAP?<meshLambertMaterial color={props.color??'#ffffff'} vertexColors={props.vertexColors??false} side={props.side??0} flatShading polygonOffset={props.depthOffset} polygonOffsetFactor={0} polygonOffsetUnits={-1}/>:<DetailedSurfaceMaterial {...props}/>
}
