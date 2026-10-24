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
