import { useLayoutEffect } from 'react';
import { useLoader } from '@react-three/fiber';
import { RepeatWrapping, SRGBColorSpace, type MeshBasicMaterial } from "three";
import { SurfaceMaterial } from "../../world/art/SurfaceMaterial";
import { ParkTextureLoader } from '../../world/art/ParkTextureLoader';
import { surfaceMapUrls } from '../../world/worldAssets';

const boardFinish: MeshBasicMaterial['onBeforeCompile'] = shader => {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <map_fragment>',
    'vec3 woodTint = diffuseColor.rgb;\n#include <map_fragment>\ndiffuseColor.rgb = mix(woodTint, diffuseColor.rgb, 0.38);',
  );
};
const boardProgramKey = () => 'gomoku-unlit-wood-v1';

/** Load only the shared wood colour map for the board, without reviving park-wide PBR maps. */
export function BoardWood() {
  const map = useLoader(ParkTextureLoader, surfaceMapUrls.wood[0]!);
  useLayoutEffect(() => {
    if (map.colorSpace === SRGBColorSpace && map.wrapS === RepeatWrapping && map.wrapT === RepeatWrapping) return;
    map.wrapS = map.wrapT = RepeatWrapping;
    map.anisotropy = 4;
    map.colorSpace = SRGBColorSpace;
    map.needsUpdate = true;
  }, [map]);
  return (
    <meshBasicMaterial
      map={map}
      color="#b68759"
      toneMapped={false}
      onBeforeCompile={boardFinish}
      customProgramCacheKey={boardProgramKey}
    />
  );
}

/** Focus backdrop follows the park's shared matte surface. */
export function FocusWood() {
  return <SurfaceMaterial kind="wood" mapping="box" meters={1.5}
    color="#7b5b40" strength={0.25} />;
}
