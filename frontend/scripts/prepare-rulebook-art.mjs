import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import sharp from 'sharp';
// Original images are not modified. No resize: preserve small Korean text at full resolution.
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/prepare-rulebook-art.mjs <prototype public/art/rulebooks>');
const target = new URL('../public/art/rulebooks/', import.meta.url);
await mkdir(target, {recursive:true});
const files = ['farkle-scores', 'onecard-play', 'onecard-actions', 'bridge-play', 'bridge-result-dice-v2'];
const hash = b => createHash('sha256').update(b).digest('hex');
const entries=[];
for (const name of files) {
  const original = await readFile(join(resolve(source), name+'.png'));
  const output = await sharp(original).webp({quality:90, effort:6, smartSubsample:true}).toBuffer();
  const {width,height} = await sharp(original).metadata();
  await writeFile(new URL(name+'.webp',target),output);
  entries.push({file:name+'.webp',source:'topgoal/apps/web/public/art/rulebooks/'+name+'.png',sourceBytes:original.length,bytes:output.length,width,height,sourceSha256:hash(original),sha256:hash(output)});
}
await writeFile(new URL('manifest.json',target),JSON.stringify({format:'WebP quality90, original dimensions; page-on-demand DOM images, no Three textures',entries},null,2)+'\n');
console.log(JSON.stringify({sourceBytes:entries.reduce((s,e)=>s+e.sourceBytes,0),bytes:entries.reduce((s,e)=>s+e.bytes,0)}));
