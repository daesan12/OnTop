import { MathUtils, Quaternion, Vector3 } from "three";
import { DIE_REST_Y, FARKLE_VISUAL } from "./presentation";

// Local animation only. Server roll duration, results and scoring stay authoritative.
export const POUR = {
  release: 0.32,
  angle: 1.65,
  mouthHeight: 0.29,
  centerX: -0.09,
  bounds: { minX: -0.64, maxX: 0.46, minZ: -0.36, maxZ: 0.36 },
} as const;

function phase(progress: number, start: number, end: number) {
  return MathUtils.smoothstep(progress, start, end);
}

export function createCupPour(x: number, y: number, z: number, sign: number) {
  const start = new Vector3(x, y, z);
  // Raise before moving across a rim. The cup base and mouth both stay over the tray when tipping.
  const anchor = new Vector3(
    MathUtils.clamp(x, POUR.bounds.minX, POUR.bounds.maxX),
    FARKLE_VISUAL.cupRestY + FARKLE_VISUAL.cupLift + 0.04,
    MathUtils.clamp(z, POUR.bounds.minZ, POUR.bounds.maxZ),
  );
  const inward = new Vector3(POUR.centerX - anchor.x, 0, -anchor.z);
  if (inward.lengthSq() < 0.000001) inward.set(0, 0, -sign);
  inward.normalize();
  // Rotating local +Y (the cup opening) around this axis points it toward the tray center.
  const axis = new Vector3(inward.z, 0, -inward.x);
  const rotation = new Quaternion().setFromAxisAngle(axis, POUR.angle);
  const launch = new Vector3(0, POUR.mouthHeight, 0)
    .applyQuaternion(rotation)
    .add(anchor);
  const rest = new Vector3(
    FARKLE_VISUAL.cupRestX,
    FARKLE_VISUAL.cupRestY,
    sign * FARKLE_VISUAL.cupRestZ,
  );
  return { start, anchor, axis, launch, rest };
}

export type CupPour = ReturnType<typeof createCupPour>;

export function sampleCupPour(
  pour: CupPour,
  progress: number,
  position: Vector3,
  rotation: Quaternion,
) {
  const approach = phase(progress, 0.1, 0.2);
  const returning = phase(progress, 0.64, 0.9);
  position.lerpVectors(pour.start, pour.anchor, approach);
  position.y = MathUtils.lerp(
    pour.start.y,
    pour.anchor.y,
    phase(progress, 0, 0.1),
  );
  position.x = MathUtils.lerp(position.x, pour.rest.x, returning);
  position.z = MathUtils.lerp(position.z, pour.rest.z, returning);
  position.y = MathUtils.lerp(position.y, pour.rest.y, phase(progress, 0.9, 1));
  const tip =
    phase(progress, 0.2, POUR.release) * (1 - phase(progress, 0.5, 0.62));
  rotation.setFromAxisAngle(pour.axis, POUR.angle * tip);
}

export function dieFlightProgress(progress: number) {
  return MathUtils.clamp((progress - POUR.release) / (1 - POUR.release), 0, 1);
}

export function sampleDiePour(
  pour: CupPour,
  progress: number,
  targetX: number,
  targetZ: number,
  position: Vector3,
) {
  const flight = dieFlightProgress(progress);
  const t = 1 - (1 - flight) ** 3;
  // A convex path between two interior points cannot send a spinning die over the rim.
  position.set(
    MathUtils.lerp(pour.launch.x, targetX, t),
    MathUtils.lerp(pour.launch.y, DIE_REST_Y, t) +
      Math.sin(flight * Math.PI) * 0.26 +
      Math.abs(Math.sin(flight * Math.PI * 4)) * (1 - flight) * 0.1,
    MathUtils.lerp(pour.launch.z, targetZ, t),
  );
}
