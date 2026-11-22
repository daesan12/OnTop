import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
const [mode,source,destination]=process.argv.slice(2)
if(!['verify','admit'].includes(mode)||!source||mode==='admit'&&!destination)throw Error('Usage: node scripts/christmas-assets.mjs verify PACKAGE | admit PACKAGE DESTINATION')
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
const manifest=JSON.parse(await fs.readFile(path.join(source,'manifest.json'),'utf8'))
if(manifest.package!=='ontop-christmas-approved-assets'||manifest.license.tripo!=='LicenseRef-Tripo-API-Output')throw Error('Package provenance/license mismatch')
if(manifest.assets.length!==5)throw Error('Expected the five approved model files')
const roster=['manifest.json','collision.json',...manifest.assets.map(a=>a.file)]
if((await fs.readdir(source)).some(f=>!roster.includes(f)))throw Error('Unexpected package file')
for(const asset of manifest.assets){
 if(path.basename(asset.file)!==asset.file)throw Error('Unsafe asset path')
 const bytes=await fs.readFile(path.join(source,asset.file))
 if(hash(bytes)!==asset.sha256||bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(8)!==bytes.length)throw Error('Invalid model bytes: '+asset.id)
 const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)))
 if(gltf.images?.some(i=>i.uri&&!i.uri.startsWith('data:')))throw Error('External image dependency')
 if(asset.id==='tree')for(const name of ['MAT_Star_Emission','MAT_StringBulb_Emission']){
  const material=gltf.materials.find(m=>m.name===name)
  if(!material||(material.emissiveFactor??[0,0,0]).some(v=>v!==0))throw Error('Tree lights must default off')
 }
 if(asset.id==='rudolph'){
  if(gltf.skins?.length!==1||!gltf.animations?.length)throw Error('Rudolph rig or gallop missing')
  const duration=Math.max(...gltf.animations.flatMap(a=>a.samplers.map(s=>gltf.accessors[s.input].max?.[0]??0)))
  if(Math.abs(duration-.8)>.001)throw Error('Gallop duration changed: '+duration)
 }
}
if(hash(await fs.readFile(path.join(source,'collision.json')))!==manifest.collision_sha256)throw Error('Collision digest mismatch')
if(mode==='admit'){
 await fs.mkdir(destination,{recursive:false})
 for(const file of roster)await fs.copyFile(path.join(source,file),path.join(destination,file),fs.constants.COPYFILE_EXCL)
 for(const asset of manifest.assets)if(hash(await fs.readFile(path.join(destination,asset.file)))!==asset.sha256)throw Error('Admitted bytes differ')
}
console.log(JSON.stringify({package:manifest.package,files:roster.length,bytes:manifest.assets.reduce((s,a)=>s+a.bytes,0),integrity:'passed',admitted:mode==='admit'}))
