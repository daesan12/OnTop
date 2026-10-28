import { afterEach, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { ParkAssetLoader } from '../../src/world/art/assetLoader';
import { CUSTOMER_ASSETS_V5 } from '../../src/features/bungeoppang/customerAssetsV5';
import { CustomerModelPoolV5 } from '../../src/features/bungeoppang/customerModelV5';
afterEach(() => vi.restoreAllMocks());
function deferredSource() {
  let resolve!: (source: GLTF) => void;
  const pending = new Promise<GLTF>(r => { resolve = r; });
  const geometry = new BoxGeometry(), texture = new Texture(), material = new MeshStandardMaterial({ map: texture });
  const scene = new Group(); scene.add(new Mesh(geometry, material));
  const source = { scene, animations: [] } as unknown as GLTF;
  const dispose = [geometry, texture, material].map(resource => vi.spyOn(resource, 'dispose'));
  vi.spyOn(ParkAssetLoader.prototype, 'loadAsync').mockReturnValue(pending);
  return { resolve: () => resolve(source), dispose };
}
it('shares a loaded look across arrival/departure without disposing the active lease', async () => {
  const input = deferredSource(), pool = new CustomerModelPoolV5();
  const first = pool.acquire(CUSTOMER_ASSETS_V5[0]); input.resolve(); await first.ready;
  first.release();
  const next = pool.acquire(CUSTOMER_ASSETS_V5[0]);
  await next.ready; await Promise.resolve();
  expect(ParkAssetLoader.prototype.loadAsync).toHaveBeenCalledTimes(1);
  input.dispose.forEach(dispose => expect(dispose).not.toHaveBeenCalled());
  next.release(); next.release(); await Promise.resolve();
  input.dispose.forEach(dispose => expect(dispose).toHaveBeenCalledTimes(1));
  pool.dispose();
});
it('disposes a late model after the visit closes, exactly once', async () => {
  const input = deferredSource(), pool = new CustomerModelPoolV5();
  const lease = pool.acquire(CUSTOMER_ASSETS_V5[0]);
  pool.dispose(); lease.release(); input.resolve(); await lease.ready; await Promise.resolve();
  input.dispose.forEach(dispose => expect(dispose).toHaveBeenCalledTimes(1));
  expect(() => pool.acquire(CUSTOMER_ASSETS_V5[0])).toThrow('closed');
});
