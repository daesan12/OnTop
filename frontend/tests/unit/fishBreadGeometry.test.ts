import { expect, it } from 'vitest';
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { createSculptedFish } from '../../src/world/art/fishBreadGeometry';

it('fits the mould outline and has outward-facing bread on both sides of a flip', () => {
  const geometry = createSculptedFish(.72), material = new MeshBasicMaterial(), mesh = new Mesh(geometry, material);
  geometry.computeBoundingBox();
  expect(geometry.boundingBox!.max.x - geometry.boundingBox!.min.x).toBeLessThan(.32);
  expect(geometry.boundingBox!.max.z - geometry.boundingBox!.min.z).toBeLessThan(.15);
  const top = new Raycaster(new Vector3(0, 1, 0), new Vector3(0, -1, 0)).intersectObject(mesh);
  const bottom = new Raycaster(new Vector3(0, -1, 0), new Vector3(0, 1, 0)).intersectObject(mesh);
  expect(top[0]!.point.y).toBeGreaterThan(.03);
  expect(bottom[0]!.point.y).toBeLessThan(-.01);
  expect(top[0]!.face!.normal.y).toBeGreaterThan(0);
  expect(bottom[0]!.face!.normal.y).toBeLessThan(0);
  geometry.dispose(); material.dispose();
});

it('recesses an empty iron die below the lip while keeping the cavity visible from above', () => {
  const geometry = createSculptedFish(.79, true), material = new MeshBasicMaterial(), mesh = new Mesh(geometry, material);
  const hit = new Raycaster(new Vector3(0, 1, 0), new Vector3(0, -1, 0)).intersectObject(mesh)[0]!;
  expect(hit.point.y).toBeLessThan(0); expect(hit.face!.normal.y).toBeGreaterThan(0);
  const normals = geometry.getAttribute('normal');
  expect(Array.from(normals.array).every(Number.isFinite)).toBe(true);
  geometry.dispose(); material.dispose();
});
