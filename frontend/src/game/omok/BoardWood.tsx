import type { MeshBasicMaterial } from "three";
import { SurfaceMaterial, useSurfaceMaps } from "../../world/art/SurfaceMaterial";

const boardFinish: MeshBasicMaterial['onBeforeCompile'] = shader => {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <map_fragment>',
    'vec3 woodTint = diffuseColor.rgb;\n#include <map_fragment>\ndiffuseColor.rgb = mix(woodTint, diffuseColor.rgb, 0.38);',
  );
};
const boardProgramKey = () => 'gomoku-unlit-wood-v1';

/** Keep the shared wood grain, but exclude lamps, reflections and exposure from the playing surface. */
export function BoardWood() {
  const { map } = useSurfaceMaps('wood');
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

/** Original focus backdrop; reuses the park's cached wood maps. */
export function FocusWood() {
  return <SurfaceMaterial kind="wood" mapping="box" meters={1.5}
    color="#7b5b40" strength={0.25} />;
}
