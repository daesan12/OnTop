import sharp from 'sharp';
import fs from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'src/assets/entry');
await fs.mkdir(out, {recursive:true});
// Retain source artwork. Entry derivatives match the largest display/texture
// budget, preserve aspect ratio/alpha, and never upscale.
const images = [
  ['src/assets/park-background.png','park-background',1920],
  ['src/assets/park-overview.png','park-overview',1920],
  ['src/assets/login-panel.png','login-panel',1600],
  ['src/assets/park-avatar.png','park-avatar',256],
  ['src/assets/yeopjeon-icon.png','yeopjeon-icon',160],
  ['src/assets/park-leaf.png','park-leaf',160],
  ['src/assets/park-people.png','park-people',64],
  ...['adv_pickus_1.webp','adv_pickus_2.webp','adv_pickus_4.webp','dero-poster.jpg']
    .map(file=>['public/art/advertisements/'+file,file.replace(/\.[^.]+$/,''),1920]),
];
let before=0, after=0;
for (const [source,name,size] of images) {
  const input=resolve(root,source), output=resolve(out,name+'.webp');
  await sharp(input).rotate().resize({width:size,height:size,fit:'inside',withoutEnlargement:true})
    .webp({quality:90,alphaQuality:100,effort:6}).toFile(output);
  const a=(await fs.stat(input)).size,b=(await fs.stat(output)).size;
  before+=a;after+=b; console.log(`${name}: ${a} -> ${b}`);
}
console.log(JSON.stringify({before,after,savingPercent:(1-after/before)*100}));
