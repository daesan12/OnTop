import fs from 'node:fs/promises';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const ids = ['boy-red-scarf', 'student-brown-coat', 'worker-earmuffs', 'older-flat-cap', 'girl-pink-hat', 'woman-glasses-bun'];
const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const sizes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };
const readers = { 5121: 'readUInt8', 5123: 'readUInt16LE', 5125: 'readUInt32LE', 5126: 'readFloatLE' };
const results = [];
for (const id of ids) {
  const file = `public/art/bungeoppang/customers/runtime/${id}.glb`, bytes = await fs.readFile(file);
  const jsonLength = bytes.readUInt32LE(12), doc = JSON.parse(bytes.subarray(20, 20 + jsonLength));
  const bin = bytes.subarray(28 + jsonLength), views = new Map();
  const view = index => {
    if (views.has(index)) return views.get(index);
    const spec = doc.bufferViews[index], compressed = spec.extensions?.EXT_meshopt_compression;
    let result;
    if (compressed) {
      result = Buffer.alloc(compressed.count * compressed.byteStride);
      MeshoptDecoder.decodeGltfBuffer(result, compressed.count, compressed.byteStride,
        bin.subarray(compressed.byteOffset ?? 0, (compressed.byteOffset ?? 0) + compressed.byteLength), compressed.mode, compressed.filter);
    } else result = bin.subarray(spec.byteOffset ?? 0, (spec.byteOffset ?? 0) + spec.byteLength);
    views.set(index, result); return result;
  };
  const accessor = index => {
    const spec = doc.accessors[index], data = view(spec.bufferView), width = widths[spec.type], size = sizes[spec.componentType];
    if (!width || !size || spec.sparse) throw Error(`${id}: unsupported accessor ${index}`);
    const stride = doc.bufferViews[spec.bufferView].byteStride ?? width * size;
    return Array.from({ length: spec.count }, (_, i) => Array.from({ length: width }, (_, k) => {
      const value = data[readers[spec.componentType]]((spec.byteOffset ?? 0) + i * stride + k * size);
      if (!Number.isFinite(value)) throw Error(`${id}: non-finite accessor ${index}`);
      return spec.normalized && spec.componentType !== 5126 ? value / (2 ** (8 * size) - 1) : value;
    }));
  };
  let triangles = 0, vertices = 0;
  for (const mesh of doc.meshes) for (const primitive of mesh.primitives) {
    const positions = accessor(primitive.attributes.POSITION), indices = accessor(primitive.indices).flat();
    if (indices.some(value => !Number.isInteger(value) || value < 0 || value >= positions.length)) throw Error(`${id}: out-of-range index`);
    const skinNode = doc.nodes.find(node => node.mesh === doc.meshes.indexOf(mesh)), skin = doc.skins[skinNode.skin];
    const joints = accessor(primitive.attributes.JOINTS_0), weights = accessor(primitive.attributes.WEIGHTS_0);
    if (joints.length !== positions.length || weights.length !== positions.length) throw Error(`${id}: skin vertex mismatch`);
    if (joints.flat().some(joint => joint < 0 || joint >= skin.joints.length)) throw Error(`${id}: out-of-range joint`);
    if (weights.some(row => row.some(w => w < 0 || w > 1) || Math.abs(row.reduce((a, b) => a + b, 0) - 1) > .005)) throw Error(`${id}: invalid skin weights`);
    accessor(primitive.attributes.NORMAL); accessor(primitive.attributes.TEXCOORD_0); accessor(skin.inverseBindMatrices);
    triangles += indices.length / 3; vertices += positions.length;
  }
  if (doc.skins.length !== 1 || doc.skins[0].joints.length !== 65 || triangles > 26000) throw Error(`${id}: skin/triangle budget`);
  const animations = doc.animations.map(animation => {
    let duration = 0;
    for (const sampler of animation.samplers) {
      const times = accessor(sampler.input).flat(); accessor(sampler.output);
      if (times.some((t, i) => t < 0 || (i && t <= times[i - 1]))) throw Error(`${id}: invalid timeline`);
      duration = Math.max(duration, times.at(-1));
    }
    if (animation.channels.some(channel => !doc.nodes[channel.target.node])) throw Error(`${id}: invalid animation target`);
    return { name: animation.name, duration, channels: animation.channels.length };
  });
  if (animations.map(a => a.name).join(',') !== 'idle,walk') throw Error(`${id}: missing idle/walk`);
  results.push({ id, bytes: bytes.length, triangles, vertices, bones: 65, animations,
    validation: 'finite attributes; index/joint bounds; normalized skin weights; inverse bind matrices; strictly increasing timelines; valid animation targets' });
}
const result = { assets: results, bytes: results.reduce((sum, r) => sum + r.bytes, 0), triangles: results.reduce((sum, r) => sum + r.triangles, 0) };
await fs.writeFile('../docs/bungeoppang-v5/npc-runtime-production/runtime-audit.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
