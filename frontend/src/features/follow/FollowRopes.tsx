import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  MeshBasicMaterial,
  Vector3,
} from "three";
import { avatars, sampleAvatar, useSession } from "../../network/worldClient";
import { sameFollowScope, useFollow } from './state';

const MAX_ROPES = 16;
const SEGMENTS = 8;
const VERTICES_PER_ROPE = SEGMENTS * 6;
const HALF_WIDTH = 0.016;

function writeVertex(
  coordinates: Float32Array,
  index: number,
  x: number,
  y: number,
  z: number,
) {
  const offset = index * 3;
  coordinates[offset] = x;
  coordinates[offset + 1] = y;
  coordinates[offset + 2] = z;
}

/** A hand-height, gently sagging ribbon shared by all active follow links. */
export function FollowRopes() {
  const geometry = useMemo(() => {
    const next = new BufferGeometry();
    const position = new BufferAttribute(
      new Float32Array(MAX_ROPES * VERTICES_PER_ROPE * 3),
      3,
    );
    position.setUsage(DynamicDrawUsage);
    next.setAttribute("position", position);
    next.setDrawRange(0, 0);
    return next;
  }, []);
  const material = useMemo(
    () => {
      const next = new MeshBasicMaterial({
        color: "#e8c2a5",
        side: DoubleSide,
        transparent: true,
        opacity: 0.93,
        depthWrite: false,
      });
      // A flat ribbon has no layered volume: avoid Three's two transparent side passes.
      next.forceSinglePass = true;
      return next;
    },
    [],
  );
  const poses = useMemo(
    () =>
      [
        { x: 0, y: 0, z: 0, yaw: 0 },
        { x: 0, y: 0, z: 0, yaw: 0 },
      ] as const,
    [],
  );
  const view = useMemo(() => new Vector3(), []);
  const cameraRight = useMemo(() => new Vector3(), []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame(({ camera }) => {
    const buffer = geometry.getAttribute("position") as BufferAttribute;
    const coordinates = buffer.array as Float32Array;
    camera.getWorldDirection(view);
    cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    let count = 0;
    const now = performance.now();
    const session = useSession.getState(), state = useFollow.getState();
    const links = session.status === 'connected' && session.mapCompatible && sameFollowScope(state.scope,
      { userId: session.sessionId, channelId: session.roomId }) ? state.links : [];
    for (const link of links) {
      const follower = avatars.get(link.followerId);
      const target = avatars.get(link.targetId);
      if (!follower?.connected || !target?.connected || count >= MAX_ROPES)
        continue;
      const a = sampleAvatar(follower, now, poses[0]);
      const b = sampleAvatar(target, now, poses[1]);
      const centerDx = b.x - a.x;
      const centerDz = b.z - a.z;
      const distance = Math.hypot(centerDx, centerDz);
      if (distance < 0.75 || distance > 24 || Math.abs(b.y - a.y) > 3.5) continue;

      // Move each end toward the other's near hand rather than the torso center.
      const inset = Math.min(0.34, distance * 0.2);
      const alongX = (centerDx / distance) * inset;
      const alongZ = (centerDz / distance) * inset;
      const startX = a.x + alongX;
      const startY = a.y - 0.2;
      const startZ = a.z + alongZ;
      const dx = centerDx - alongX * 2;
      const dy = b.y - a.y;
      const dz = centerDz - alongZ * 2;
      const sag = Math.min(0.38, 0.16 + (distance - 2) * 0.035);

      for (let part = 0; part < SEGMENTS; part++) {
        const t0 = part / SEGMENTS;
        const t1 = (part + 1) / SEGMENTS;
        const x0 = startX + dx * t0;
        const y0 = startY + dy * t0 - sag * 4 * t0 * (1 - t0);
        const z0 = startZ + dz * t0;
        const x1 = startX + dx * t1;
        const y1 = startY + dy * t1 - sag * 4 * t1 * (1 - t1);
        const z1 = startZ + dz * t1;
        const tx = x1 - x0;
        const ty = y1 - y0;
        const tz = z1 - z0;
        let sideX = ty * view.z - tz * view.y;
        let sideY = tz * view.x - tx * view.z;
        let sideZ = tx * view.y - ty * view.x;
        const sideLength = Math.hypot(sideX, sideY, sideZ);
        if (sideLength > 0.0001) {
          const width = HALF_WIDTH / sideLength;
          sideX *= width;
          sideY *= width;
          sideZ *= width;
        } else {
          sideX = cameraRight.x * HALF_WIDTH;
          sideY = cameraRight.y * HALF_WIDTH;
          sideZ = cameraRight.z * HALF_WIDTH;
        }
        const vertex = count * VERTICES_PER_ROPE + part * 6;
        writeVertex(coordinates, vertex, x0 - sideX, y0 - sideY, z0 - sideZ);
        writeVertex(
          coordinates,
          vertex + 1,
          x0 + sideX,
          y0 + sideY,
          z0 + sideZ,
        );
        writeVertex(
          coordinates,
          vertex + 2,
          x1 - sideX,
          y1 - sideY,
          z1 - sideZ,
        );
        writeVertex(
          coordinates,
          vertex + 3,
          x1 - sideX,
          y1 - sideY,
          z1 - sideZ,
        );
        writeVertex(
          coordinates,
          vertex + 4,
          x0 + sideX,
          y0 + sideY,
          z0 + sideZ,
        );
        writeVertex(
          coordinates,
          vertex + 5,
          x1 + sideX,
          y1 + sideY,
          z1 + sideZ,
        );
      }
      count++;
    }
    geometry.setDrawRange(0, count * VERTICES_PER_ROPE);
    if (count > 0) buffer.needsUpdate = true;
  });
  return <mesh name="follow-ropes" geometry={geometry} material={material} frustumCulled={false} dispose={null} />;
}
