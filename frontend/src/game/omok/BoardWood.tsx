import { useLayoutEffect, useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import { RepeatWrapping, SRGBColorSpace, type MeshStandardMaterial, type Texture } from 'three'
import { ParkTextureLoader } from '../../world/art/ParkTextureLoader'
import { surfaceMapUrls } from '../../world/worldAssets'

const configured = new WeakSet<Texture>()

/** Prototype wood finish, scoped to the board and supplies rather than the whole park. */
export function OmokWood({ color = '#ffffff', detail = .42, strength = .1, mapping = 'uv' }: {
  color?: string; detail?: number; strength?: number; mapping?: 'uv' | 'box'
}) {
  const maps = useLoader(ParkTextureLoader, surfaceMapUrls.wood)
  useLayoutEffect(() => {
    maps.forEach((map, index) => {
      if (configured.has(map)) return
      map.wrapS = map.wrapT = RepeatWrapping
      map.anisotropy = 4
      if (index === 0) map.colorSpace = SRGBColorSpace
      map.needsUpdate = true
      configured.add(map)
    })
  }, [maps])
  const compile = useMemo<MeshStandardMaterial['onBeforeCompile']>(() => shader => {
    shader.uniforms.omokWoodDetail = { value: detail }
    shader.fragmentShader = `uniform float omokWoodDetail;\n${shader.fragmentShader}`
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
      'vec3 woodTint = diffuseColor.rgb;\n#include <map_fragment>\ndiffuseColor.rgb = mix(woodTint, diffuseColor.rgb, omokWoodDetail);')
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor, .58, .9);')
    if (mapping === 'box') {
      shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `
        #include <uv_vertex>
        vec3 woodScale = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
        vec3 woodPoint = position * woodScale;
        vec3 woodFace = abs(normal);
        vec2 woodUv = woodFace.y >= woodFace.x && woodFace.y >= woodFace.z ? woodPoint.xz
          : woodFace.x > woodFace.z ? woodPoint.zy : woodPoint.xy;
        if (woodScale.x > woodScale.z) woodUv = woodUv.yx;
        vMapUv = woodUv / 1.5;
        vNormalMapUv = vMapUv;
        vRoughnessMapUv = vMapUv;
      `)
    }
  }, [detail, mapping])
  return <meshStandardMaterial map={maps[0]} normalMap={maps[1]} roughnessMap={maps[2]}
    color={color} normalScale={[strength, strength]} roughness={1}
    onBeforeCompile={compile} customProgramCacheKey={() => `omok-prototype-wood-${mapping}-${detail}`} />
}

export function BoardWood() {
  return <OmokWood color="#c89b62" detail={.22} strength={.035} />
}

export function FocusWood() {
  return <OmokWood color="#7b5b40" detail={1} strength={.25} mapping="box" />
}
