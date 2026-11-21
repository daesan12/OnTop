import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const directory = new URL('../park-renewal-preview/models/', import.meta.url);
const catalog = {};
for (const name of (await readdir(directory)).filter(name => /^(detail|facility)-.+-optimized\.glb$/.test(name)).sort()) {
  const bytes = await readFile(new URL(name, directory));
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(16) !== 0x4e4f534a) throw Error('Invalid GLB: ' + name);
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const parts = [];
  const visit = index => {
    const node = gltf.nodes[index];
    if (node.mesh !== undefined) {
      if (!Number.isSafeInteger(node.extras?.sourceTriangles) || !Number.isSafeInteger(node.extras?.sourceVertices)) throw Error('Missing source metadata: ' + name);
      parts.push({name: node.name, triangles: node.extras.sourceTriangles, vertices: node.extras.sourceVertices, attributes: node.extras.attrs});
    }
    for (const child of node.children ?? []) visit(child);
  };
  for (const root of gltf.scenes[gltf.scene ?? 0].nodes) visit(root);
  catalog[name] = {sha256: createHash('sha256').update(bytes).digest('hex'), parts};
}
await writeFile(new URL('geometry-catalog.json', directory), JSON.stringify(catalog, null, 2) + '\n');
console.log('Cataloged ' + Object.keys(catalog).length + ' optimized park models');
