import {
  ACESFilmicToneMapping, AnimationMixer, Box3, Color, DirectionalLight, Fog, Group, HemisphereLight, Mesh,
  MeshStandardMaterial, PCFShadowMap, PerspectiveCamera, PlaneGeometry,
  PMREMGenerator, Scene, SRGBColorSpace, Texture, Vector3, WebGLRenderer,
  Bone, SkinnedMesh, type AnimationClip, type Object3D,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ParkAssetLoader } from '../../src/world/art/assetLoader';
import { CUSTOMER_PREVIEW_ASSETS } from './customerPreviewAssets';
import { instantiateCustomerV5 } from '../../src/features/bungeoppang/customerModelV5';
import type { CustomerAssetV5 } from '../../src/features/bungeoppang/customerAssetsV5';

type PreviewAsset = typeof CUSTOMER_PREVIEW_ASSETS[number];
const host = document.querySelector<HTMLElement>('#stage')!;
const status = document.querySelector<HTMLElement>('#status')!;
const controlsButtons = [...document.querySelectorAll<HTMLButtonElement>('.toolbar button')];
const characterButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-customer]')];
const scene = new Scene();
scene.background = new Color('#f1ebe2');
scene.fog = new Fog('#f1ebe2', 4, 12);
const camera = new PerspectiveCamera(31, 1, .01, 30);
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;
host.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false;
controls.enablePan = false;
controls.minDistance = .35;
controls.maxDistance = 6;
controls.maxPolarAngle = Math.PI * .88;
controls.autoRotateSpeed = .8;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const pmrem = new PMREMGenerator(renderer);
const room = new RoomEnvironment();
const environment = pmrem.fromScene(room, .04);
scene.environment = environment.texture;
scene.environmentIntensity = .35;
room.dispose();
pmrem.dispose();
scene.add(new HemisphereLight('#fff6e9', '#9c8c7b', 1.1));
const key = new DirectionalLight('#fff5e7', 3.1);
key.position.set(-2.5, 4, 4);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = key.shadow.camera.bottom = -1.8;
key.shadow.camera.right = key.shadow.camera.top = 1.8;
key.shadow.normalBias = .015;
key.shadow.bias = -.0002;
scene.add(key);
const fill = new DirectionalLight('#e9efff', 1);
fill.position.set(3, 2, 2);
scene.add(fill);
const rim = new DirectionalLight('#fff3e6', 1.8);
rim.position.set(1.5, 3, -3);
scene.add(rim);
const floor = new Mesh(new PlaneGeometry(200, 200), new MeshStandardMaterial({ color: '#f1ebe2', roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -.003;
floor.receiveShadow = true;
scene.add(floor);
const actor = new Group();
// The provider meshes face +X. Correct the preview group without editing their source GLBs.
actor.rotation.y = -Math.PI / 2;
scene.add(actor);
const requested = new URLSearchParams(location.search).get('customer');
const runtime = !new URLSearchParams(location.search).has('source');
let motion = new URLSearchParams(location.search).get('motion') === 'walk' ? 'walk' : 'idle';
let clips: AnimationClip[] = [];
let mixer: AnimationMixer | undefined;
let runtimeActor: ReturnType<typeof instantiateCustomerV5> | undefined, runtimeSource: Object3D | undefined;
let selected: PreviewAsset = CUSTOMER_PREVIEW_ASSETS.find(asset => asset.id === requested && asset.available) ?? CUSTOMER_PREVIEW_ASSETS[0];
let view = 'body', angle = 0, ready = false, triangles = 0, meshes = 0, animations = 0, loadError: string | null = null;
let sourceBounds: number[] = [], textures = new Set<Texture>(), loadVersion = 0, pendingLoads = 0, disposed = false;
const loader = new ParkAssetLoader();

function disposeModel(model: Object3D) {
  const modelTextures = new Set<Texture>();
  const geometries = new Set<Mesh['geometry']>();
  const materials = new Set<MeshStandardMaterial>();
  model.traverse(object => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    if (object instanceof SkinnedMesh) object.skeleton.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof Texture) modelTextures.add(value);
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  const bitmaps = new Set<ImageBitmap>();
  modelTextures.forEach(texture => {
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) bitmaps.add(texture.image);
    texture.dispose();
  });
  bitmaps.forEach(bitmap => bitmap.close());
}
function resetView() {
  const y = view === 'face' ? selected.faceY : .85;
  const distance = Math.max(view === 'face' ? 1.5 : 3.8,
    (view === 'face' ? .8 : 1.25) / (2 * Math.tan(camera.fov * Math.PI / 360) * camera.aspect));
  camera.position.set(Math.sin(angle) * distance, y + (view === 'face' ? .04 : .10), Math.cos(angle) * distance);
  controls.target.set(0, y, 0);
  controls.update();
}
function setAuto(enabled: boolean) {
  controls.autoRotate = enabled;
  const button = document.querySelector<HTMLButtonElement>('#auto')!;
  button.setAttribute('aria-pressed', String(enabled));
  button.textContent = enabled ? '회전 멈추기' : '자동 회전';
}
function selectCharacter(asset: PreviewAsset) {
  if (!asset.available) return;
  selected = asset;
  const version = ++loadVersion;
  ready = false;
  loadError = null;
  triangles = meshes = animations = 0;
  sourceBounds = [];
  textures = new Set();
  delete host.dataset.ready;
  delete host.dataset.error;
  status.hidden = false;
  status.textContent = asset.name + ' 모델을 불러오고 있어요.';
  host.setAttribute('aria-busy', 'true');
  controlsButtons.forEach(button => { button.disabled = true; });
  setAuto(false);
  angle = 0;
  document.querySelectorAll('[data-angle]').forEach(button => button.setAttribute('aria-pressed', String(button.getAttribute('data-angle') === '0')));
  characterButtons.forEach(button => {
    const entry = CUSTOMER_PREVIEW_ASSETS.find(item => item.id === button.dataset.customer)!;
    button.disabled = !entry.available;
    button.setAttribute('aria-pressed', String(entry.id === asset.id));
  });
  document.querySelector('#character-name')!.textContent = asset.name;
  document.querySelector('#character-description')!.textContent = asset.description;
  renderer.domElement.setAttribute('aria-label', '회전 가능한 ' + asset.name + ' 3D 모델');
  const reference = document.querySelector<HTMLImageElement>('#reference-image')!;
  reference.src = '/art/bungeoppang/customers/' + asset.id + '-reference-v1.png';
  reference.alt = asset.name + ' 제작용 전신 이미지';
  const query = new URLSearchParams(location.search);
  query.set('customer', asset.id);
  history.replaceState(null, '', location.pathname + '?' + query.toString());
  mixer?.stopAllAction();
  if (mixer) mixer.uncacheRoot(mixer.getRoot());
  mixer = undefined;
  runtimeActor?.dispose(); runtimeActor = undefined;
  if (runtimeSource) disposeModel(runtimeSource);
  runtimeSource = undefined;
  for (const child of [...actor.children]) { actor.remove(child); disposeModel(child); }
  resetView();
  pendingLoads++;
  void loader.loadAsync(runtime ? '/art/bungeoppang/customers/runtime/' + asset.id + '.glb' : '/art/bungeoppang/customers/' + asset.id + '-v1.glb', event => {
    if (version !== loadVersion || disposed) return;
    if (event.lengthComputable) status.textContent = asset.name + ' 모델을 불러오고 있어요. ' + Math.round(event.loaded / event.total * 100) + '%';
  }).then(gltf => {
    const model = gltf.scene;
    if (version !== loadVersion || disposed) { disposeModel(model); return; }
    const box = new Box3().setFromObject(model);
    const size = box.getSize(new Vector3());
    sourceBounds = size.toArray();
    if (!Number.isFinite(size.y) || size.y <= 0) { disposeModel(model); throw new Error('모델의 크기 정보를 확인할 수 없습니다.'); }
    if (!runtime) {
      model.scale.multiplyScalar(1.6 / size.y);
      model.updateMatrixWorld(true);
      box.setFromObject(model);
      const center = box.getCenter(new Vector3());
      model.position.add(new Vector3(-center.x, -box.min.y, -center.z));
    }
    model.traverse(object => {
      if (!(object instanceof Mesh)) return;
      meshes++;
      const geometry = object.geometry;
      triangles += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
      object.castShadow = object.receiveShadow = true;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        for (const value of Object.values(material)) if (value instanceof Texture) {
          value.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          textures.add(value);
        }
      }
    });
    animations = gltf.animations.length;
    clips = gltf.animations;
    if (runtime) {
      actor.rotation.y = 0;
      runtimeActor = instantiateCustomerV5(gltf, { id: asset.id as CustomerAssetV5['id'], height: 1.6 });
      runtimeSource = model; mixer = runtimeActor.mixer;
      runtimeActor.play(motion === 'walk' ? 'walk' : 'idle');
      actor.add(runtimeActor.root);
    } else actor.add(model);
    ready = true;
    host.dataset.ready = 'true';
    host.setAttribute('aria-busy', 'false');
    status.hidden = true;
    controlsButtons.forEach(button => { button.disabled = false; });
  }).catch((error: unknown) => {
    if (version !== loadVersion || disposed) return;
    loadError = error instanceof Error ? error.message : String(error);
    status.textContent = '모델을 불러오지 못했어요. 손님을 다시 선택해 주세요.';
    host.dataset.error = 'true';
    host.setAttribute('aria-busy', 'false');
    console.error(error);
  }).finally(() => { pendingLoads--; });
}
controls.addEventListener('start', () => {
  setAuto(false);
  document.querySelectorAll('[data-angle]').forEach(button => button.setAttribute('aria-pressed', 'false'));
});
characterButtons.forEach(button => {
  button.addEventListener('click', () => {
    const asset = CUSTOMER_PREVIEW_ASSETS.find(item => item.id === button.dataset.customer)!;
    if (asset.id === selected.id && !loadError) return;
    selectCharacter(asset);
  });
});
document.querySelectorAll<HTMLButtonElement>('[data-angle]').forEach(button => button.addEventListener('click', () => {
  angle = Number(button.dataset.angle) * Math.PI / 180;
  setAuto(false);
  document.querySelectorAll('[data-angle]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
  resetView();
}));
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.addEventListener('click', () => {
  view = button.dataset.view!;
  document.querySelectorAll('[data-view]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
  resetView();
}));
document.querySelector('#auto')!.addEventListener('click', () => setAuto(!controls.autoRotate));
document.querySelectorAll<HTMLButtonElement>('[data-motion]').forEach(button => {
  button.hidden = !runtime;
  button.setAttribute('aria-pressed', String(button.dataset.motion === motion));
  button.addEventListener('click', () => {
    const clip = clips.find(clip => clip.name === button.dataset.motion);
    if (!mixer || !clip) return;
    runtimeActor?.play(button.dataset.motion === 'walk' ? 'walk' : 'idle');
    motion = button.dataset.motion!;
    document.querySelectorAll('[data-motion]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
  });
});
const motionChanged = () => { if (reducedMotion.matches) setAuto(false); };
reducedMotion.addEventListener('change', motionChanged);
const resize = () => {
  const rect = host.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
};
const observer = new ResizeObserver(resize);
observer.observe(host);
resize();
selectCharacter(selected);
let frame = 0, previous = performance.now();
function render(now: number) {
  runtimeActor?.update(Math.min((now - previous) / 1000, .1), 0, 1);
  controls.update(Math.min((now - previous) / 1000, .1));
  previous = now;
  renderer.render(scene, camera);
  frame = requestAnimationFrame(render);
}
frame = requestAnimationFrame(render);
Reflect.set(window, '__customerPreview', {
  inspect: () => ({
    ready, pendingLoads, customerId: selected.id, available: CUSTOMER_PREVIEW_ASSETS.filter(asset => asset.available).map(asset => asset.id),
    modelUrl: runtime ? '/art/bungeoppang/customers/runtime/' + selected.id + '.glb' : '/art/bungeoppang/customers/' + selected.id + '-v1.glb',
    view, angle, autoRotate: controls.autoRotate, triangles, meshes, animations, runtime, motion,
    sourceBounds, bounds: ready ? new Box3().setFromObject(actor).getSize(new Vector3()).toArray() : [],
    pose: (() => { const values: number[] = []; actor.traverse(object => {
      if (object instanceof Bone) values.push(...object.quaternion.toArray());
    }); return values; })(),
    camera: camera.position.toArray(), target: controls.target.toArray(),
    geometry: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
    textureImages: [...textures].map(texture => {
      const image = texture.image as { width?: number; height?: number } | undefined;
      return { width: image?.width, height: image?.height, colorSpace: texture.colorSpace };
    }), loadError,
  }),
});
window.addEventListener('pagehide', () => {
  disposed = true;
  loadVersion++;
  cancelAnimationFrame(frame);
  observer.disconnect();
  reducedMotion.removeEventListener('change', motionChanged);
  controls.dispose();
  mixer?.stopAllAction();
  if (mixer) mixer.uncacheRoot(mixer.getRoot());
  runtimeActor?.dispose();
  if (runtimeSource) disposeModel(runtimeSource);
  actor.children.forEach(disposeModel);
  floor.geometry.dispose();
  floor.material.dispose();
  environment.dispose();
  key.shadow.dispose();
  renderer.dispose();
}, { once: true });
