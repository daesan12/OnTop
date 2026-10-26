import { SurfaceMaterial } from "../../world/art/SurfaceMaterial";

/** Shared wood maps, tinted walnut; the playable surface keeps its original UVs. */
export function BoardWood() {
  return (
    <SurfaceMaterial
      kind="wood"
      color="#78472d"
      detail={0.38}
      strength={0.08}
    />
  );
}

/** Original focus backdrop; reuses the park's cached wood maps. */
export function FocusWood() {
  return <SurfaceMaterial kind="wood" mapping="box" meters={1.5}
    color="#7b5b40" strength={0.25} />;
}
