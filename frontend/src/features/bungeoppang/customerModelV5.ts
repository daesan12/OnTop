import { AnimationMixer, Box3, Group, Mesh, MeshStandardMaterial, Quaternion, SkinnedMesh, Texture, Vector3,
  type AnimationAction, type Object3D } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { ParkAssetLoader } from '../../world/art/assetLoader';
import { customerModelUrlV5, type CustomerModelIdV5 } from './customerAssetsV5';

export type CustomerMotionV5 = 'idle' | 'walk';
type Entry = { refs: number; pending: Promise<GLTF>; source?: GLTF; disposed: boolean };

function disposeSource(source: GLTF) {
  const geometries = new Set<Mesh['geometry']>(), materials = new Set<MeshStandardMaterial>(), textures = new Set<Texture>();
  const bitmaps = new Set<ImageBitmap>();
  source.scene.traverse(object => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    if (object instanceof SkinnedMesh) object.skeleton.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    }
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  textures.forEach(texture => {
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) bitmaps.add(texture.image);
    texture.dispose();
  });
  bitmaps.forEach(bitmap => bitmap.close());
}

/** A visit owns this pool: no global useLoader cache retains skins or 2K textures after leaving. */
export class CustomerModelPoolV5 {
  private loader = new ParkAssetLoader();
  private entries = new Map<string, Entry>();
  private closed = false;
  acquire(asset: { id: CustomerModelIdV5 }) {
    if (this.closed) throw new Error('Customer model pool is closed');
    let entry = this.entries.get(asset.id);
    if (!entry) {
      const created: Entry = { refs: 0, disposed: false, pending: this.loader.loadAsync(customerModelUrlV5(asset.id)) };
      entry = created; this.entries.set(asset.id, created);
      // Both fulfillment and rejection are observed even when every consumer leaves during loading.
      void created.pending.then(source => { created.source = source; this.collect(asset.id, created); }, () => this.collect(asset.id, created));
    }
    entry.refs++;
    const held = entry;
    let released = false;
    return { ready: held.pending, release: () => {
      if (released) return; released = true; held.refs--;
      // Arrival/departure handoff can acquire the same look later in this React commit.
      queueMicrotask(() => this.collect(asset.id, held));
    } };
  }
  private collect(id: string, entry: Entry) {
    if (entry.refs > 0 && !this.closed) return;
    if (this.entries.get(id) === entry) this.entries.delete(id);
    if (entry.source && !entry.disposed) { entry.disposed = true; disposeSource(entry.source); }
  }
  dispose() {
    this.closed = true;
    for (const [id, entry] of this.entries) this.collect(id, entry);
  }
}

/** Geometry/textures are shared; bones, mixer and fadeable materials belong to one customer. */
export function instantiateCustomerV5(source: GLTF, asset: { id: CustomerModelIdV5; height: number }) {
  const model = clone(source.scene), root = new Group(), centered = new Group();
  centered.add(model); root.add(centered);
  const materials = new Set<MeshStandardMaterial>();
  model.traverse(object => {
    if (!(object instanceof Mesh)) return;
    object.frustumCulled = false; // Walking skin can leave the rest-pose bounding sphere.
    object.castShadow = object.receiveShadow = true;
    const ownMaterial = (material: MeshStandardMaterial) => {
      const own = material.clone();
      own.emissive.set('#ffffff'); own.emissiveIntensity = .10;
      own.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n totalEmissiveRadiance *= diffuseColor.rgb;');
      };
      own.customProgramCacheKey = () => 'bung-customer-pbr-night-v1';
      materials.add(own); return own;
    };
    object.material = Array.isArray(object.material) ? object.material.map(ownMaterial) : ownMaterial(object.material);
  });
  const mixer = new AnimationMixer(model), actions = new Map<CustomerMotionV5, AnimationAction>();
  let head: Object3D | undefined;
  model.traverse(object => { if (/mixamorig:?Head$/.test(object.name)) head = object; });
  const baseHead = new Quaternion(), parentRotation = new Quaternion(), rootRotation = new Quaternion(), tilt = new Quaternion(), axis = new Vector3();
  const liftGaze = () => {
    if (!head?.parent || asset.id !== 'girl-pink-hat') return;
    root.updateMatrixWorld(true);
    axis.set(0, 0, -1).applyQuaternion(root.getWorldQuaternion(rootRotation));
    axis.applyQuaternion(head.parent.getWorldQuaternion(parentRotation).invert());
    head.quaternion.premultiply(tilt.setFromAxisAngle(axis, -.42));
  };
  for (const name of ['idle', 'walk'] as const) {
    const clip = source.animations.find(clip => clip.name === name);
    if (!clip) { materials.forEach(m => m.dispose()); throw new Error(`Missing customer clip: ${name}`); }
    actions.set(name, mixer.clipAction(clip));
  }
  let motion: CustomerMotionV5 | undefined;
  let immediateMode = false;
  const play = (next: CustomerMotionV5, immediate = false) => {
    if (next === motion && immediateMode === immediate) return;
    if (immediate) mixer.stopAllAction();
    const action = actions.get(next)!;
    action.reset().play();
    if (motion && !immediate) action.crossFadeFrom(actions.get(motion)!, .22, false);
    motion = next; immediateMode = immediate;
  };
  play('idle'); mixer.update(.001); // Never display the bind pose for a frame.
  if (head) baseHead.copy(head.quaternion);
  liftGaze();
  model.updateMatrixWorld(true);
  // Rigging changes the rest origin. Normalize the evaluated idle pose, not its bind-pose bounds.
  model.traverse(object => { if (object instanceof SkinnedMesh) object.computeBoundingBox(); });
  const box = new Box3().setFromObject(model), center = box.getCenter(new Vector3());
  const height = box.max.y - box.min.y;
  if (!Number.isFinite(height) || height <= 0) throw new Error('Invalid customer model bounds');
  centered.position.set(-center.x, -box.min.y, -center.z);
  root.scale.setScalar(asset.height / height);
  root.rotation.y = -Math.PI / 2; // Provider faces +X; the cooking counter faces +Z.
  return { root, mixer, play,
    update(delta: number, night: number, opacity: number) {
      if (head) head.quaternion.copy(baseHead);
      mixer.update(Math.min(delta, .1));
      if (head) baseHead.copy(head.quaternion);
      liftGaze();
      for (const material of materials) {
        material.emissiveIntensity = .10 + night * .25;
        const transparent = opacity < 1;
        if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
        material.opacity = opacity; material.depthWrite = !transparent;
      }
    },
    dispose() {
      mixer.stopAllAction(); mixer.uncacheRoot(model);
      model.traverse((object: Object3D) => { if (object instanceof SkinnedMesh) object.skeleton.dispose(); });
      materials.forEach(material => material.dispose()); root.removeFromParent();
    },
  };
}
