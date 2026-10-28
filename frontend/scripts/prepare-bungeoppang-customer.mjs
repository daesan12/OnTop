import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

// Deterministic asset build: preserve the provider source, skin, animation and retained vertex data.
// Usage: node scripts/prepare-bungeoppang-customer.mjs <source.glb> <output.glb> [target-triangles]
const [source, destination, targetArgument] = process.argv.slice(2);
if (!source || !destination || path.resolve(source) === path.resolve(destination))
  throw new Error('Provide distinct source.glb and output.glb paths.');
const targetTriangles = Number(targetArgument ?? 20000);
if (!Number.isInteger(targetTriangles) || targetTriangles < 5000 || targetTriangles > 40000)
  throw new Error('Triangle budget must be 5000..40000.');
await Promise.all([MeshoptSimplifier.ready, MeshoptEncoder.ready, MeshoptDecoder.ready]);
const input = await fs.readFile(source);
if (input.readUInt32LE(0) !== 0x46546c67 || input.readUInt32LE(4) !== 2 || input.readUInt32LE(8) !== input.length)
  throw new Error('Expected a complete GLB 2.0 file.');
const jsonLength = input.readUInt32LE(12);
const doc = JSON.parse(input.subarray(20, 20 + jsonLength).toString());
const bin = input.subarray(28 + jsonLength);
if ((doc.buffers ?? []).length !== 1 || doc.buffers[0].uri ||
    (doc.bufferViews ?? []).some(v => v.extensions?.EXT_meshopt_compression))
  throw new Error('Expected a single uncompressed embedded source buffer.');
const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const sizes = {5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
const readers = {5120:'readInt8',5121:'readUInt8',5122:'readInt16LE',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
const dataByAccessor = new Map();
function readAccessor(index) {
  if (dataByAccessor.has(index)) return dataByAccessor.get(index);
  const spec = doc.accessors[index], view = doc.bufferViews[spec?.bufferView];
  if (!spec || !view || spec.sparse || !components[spec.type] || !sizes[spec.componentType])
    throw new Error('Unsupported or sparse accessor ' + index);
  const width = components[spec.type] * sizes[spec.componentType];
  const stride = view.byteStride ?? width;
  const start = (view.byteOffset ?? 0) + (spec.byteOffset ?? 0);
  const bytes = Buffer.alloc(spec.count * width);
  for (let i=0; i<spec.count; i++) bin.copy(bytes, i*width, start+i*stride, start+i*stride+width);
  const value = {spec,bytes,width};
  dataByAccessor.set(index,value);
  return value;
}
function numeric(index) {
  const a=readAccessor(index), size=sizes[a.spec.componentType], read=readers[a.spec.componentType];
  const result=new Float32Array(a.spec.count*components[a.spec.type]);
  for(let i=0;i<result.length;i++){
    let value=a.bytes[read](i*size);
    if(a.spec.normalized){
      const type=a.spec.componentType;
      value=type===5121?value/255:type===5123?value/65535:type===5120?Math.max(-1,value/127):Math.max(-1,value/32767);
    }
    if(!Number.isFinite(value))throw new Error('Non-finite accessor ' + index);
    result[i]=value;
  }
  return result;
}
function addAccessor(spec,bytes) {
  const index=doc.accessors.length;
  doc.accessors.push(spec);
  dataByAccessor.set(index,{spec,bytes,width:components[spec.type]*sizes[spec.componentType]});
  return index;
}
const primitiveCount=doc.meshes.reduce((sum,m)=>sum+m.primitives.length,0);
const geometryAccessors=new Map();
const meshRecords=[];
for(const mesh of doc.meshes) for(const primitive of mesh.primitives){
  if((primitive.mode??4)!==4 || primitive.targets?.length)throw new Error('Only triangle meshes without morph targets are supported.');
  const positionIndex=primitive.attributes.POSITION;
  const position=readAccessor(positionIndex);
  if(position.spec.componentType!==5126)throw new Error('Expected float positions.');
  const positions=numeric(positionIndex);
  const sourceIndices=primitive.indices===undefined
    ?Uint32Array.from({length:position.spec.count},(_,i)=>i)
    :Uint32Array.from(numeric(primitive.indices));
  const attributeNames=['NORMAL','TEXCOORD_0','WEIGHTS_0','JOINTS_0'].filter(name=>primitive.attributes[name]!==undefined);
  const attributeSources=attributeNames.map(name=>numeric(primitive.attributes[name]));
  const attributeComponents=attributeNames.map(name=>components[readAccessor(primitive.attributes[name]).spec.type]);
  const attributeStride=attributeComponents.reduce((sum,n)=>sum+n,0);
  const attributes=new Float32Array(position.spec.count*attributeStride);
  const weights=[];
  let componentOffset=0;
  attributeNames.forEach((name,a)=>{
    const count=attributeComponents[a];
    for(let c=0;c<count;c++)weights.push(name==='TEXCOORD_0'?1:name==='JOINTS_0'?.02:name==='WEIGHTS_0'?.25:.5);
    for(let v=0;v<position.spec.count;v++)for(let c=0;c<count;c++)
      attributes[v*attributeStride+componentOffset+c]=attributeSources[a][v*count+c];
    componentOffset+=count;
  });
  const target=Math.min(sourceIndices.length,Math.floor(targetTriangles/primitiveCount)*3);
  const [simplified,error]=attributeStride
    ?MeshoptSimplifier.simplifyWithAttributes(sourceIndices,positions,3,attributes,attributeStride,weights,null,target,.004,['Regularize'])
    :MeshoptSimplifier.simplify(sourceIndices,positions,3,target,.004,['Regularize']);
  const indices=new Uint32Array(simplified);
  const [remap,vertexCount]=MeshoptSimplifier.compactMesh(indices);
  for(const [name,index] of Object.entries(primitive.attributes)){
    const a=readAccessor(index), bytes=Buffer.alloc(vertexCount*a.width);
    for(let old=0;old<a.spec.count;old++){
      const next=remap[old];
      if(next!==undefined&&next!==0xffffffff)a.bytes.copy(bytes,next*a.width,old*a.width,(old+1)*a.width);
    }
    const spec={...a.spec,count:vertexCount};
    delete spec.bufferView;delete spec.byteOffset;delete spec.min;delete spec.max;
    if(name==='POSITION'){
      spec.min=[Infinity,Infinity,Infinity];spec.max=[-Infinity,-Infinity,-Infinity];
      for(let v=0;v<vertexCount;v++)for(let axis=0;axis<3;axis++){
        const n=bytes.readFloatLE(v*12+axis*4);
        spec.min[axis]=Math.min(spec.min[axis],n);spec.max[axis]=Math.max(spec.max[axis],n);
      }
    }
    const next=addAccessor(spec,bytes);
    primitive.attributes[name]=next;geometryAccessors.set(next,'ATTRIBUTES');
  }
  const compact=vertexCount<=65535?Uint16Array.from(indices):indices;
  primitive.indices=addAccessor({componentType:vertexCount<=65535?5123:5125,count:indices.length,type:'SCALAR'},Buffer.from(compact.buffer));
  geometryAccessors.set(primitive.indices,'TRIANGLES');
  meshRecords.push({sourceTriangles:sourceIndices.length/3,triangles:indices.length/3,vertices:vertexCount,relativeError:error});
}
const used=new Set();
for(const mesh of doc.meshes)for(const p of mesh.primitives){used.add(p.indices);Object.values(p.attributes).forEach(i=>used.add(i));}
for(const skin of doc.skins??[])if(skin.inverseBindMatrices!==undefined)used.add(skin.inverseBindMatrices);
for(const animation of doc.animations??[])for(const sampler of animation.samplers){used.add(sampler.input);used.add(sampler.output);}
const chunks=[],views=[],accessors=[];
let offset=0,fallback=0;
function append(bytes){
  const start=offset,padded=Buffer.alloc((bytes.length+3)&~3);
  bytes.copy(padded);chunks.push(padded);offset+=padded.length;
  return {byteOffset:start,byteLength:bytes.length};
}
function packedView(bytes,width,mode){
  const index=views.length;
  if(!mode){views.push({buffer:0,...append(bytes)});return index;}
  const stride=mode==='ATTRIBUTES'?(width+3)&~3:width;
  let data=bytes;
  if(stride!==width){data=Buffer.alloc(bytes.length/width*stride);for(let i=0;i<bytes.length/width;i++)bytes.copy(data,i*stride,i*width,(i+1)*width);}
  const encoded=MeshoptEncoder.encodeGltfBuffer(data,data.length/stride,stride,mode);
  const decoded=new Uint8Array(data.length);
  MeshoptDecoder.decodeGltfBuffer(decoded,data.length/stride,stride,encoded,mode);
  const decodedBytes=Buffer.from(decoded);
  if(mode==='TRIANGLES'){
    // Triangle encoding may cyclically rotate a triangle's vertices; winding and topology must match.
    const read=stride===2?'readUInt16LE':'readUInt32LE';
    for(let i=0;i<data.length;i+=stride*3){
      const a=[0,1,2].map(k=>data[read](i+k*stride));
      const b=[0,1,2].map(k=>decodedBytes[read](i+k*stride));
      if(![0,1,2].some(r=>a.every((v,k)=>v===b[(k+r)%3])))throw new Error('Triangle compression changed topology.');
    }
  }else if(!decodedBytes.equals(data))throw new Error('Meshopt attribute round-trip failed.');
  views.push({buffer:1,byteOffset:fallback,byteLength:data.length,
    ...(mode==='ATTRIBUTES'?{byteStride:stride,target:34962}:{target:34963}),
    extensions:{EXT_meshopt_compression:{buffer:0,...append(Buffer.from(encoded)),byteStride:stride,count:data.length/stride,mode,filter:'NONE'}}});
  fallback+=(data.length+3)&~3;
  return index;
}
const accessorMap=new Map();
for(const index of used){
  const a=readAccessor(index);
  const spec={...a.spec,bufferView:packedView(a.bytes,a.width,geometryAccessors.get(index))};
  delete spec.byteOffset;
  accessorMap.set(index,accessors.length);accessors.push(spec);
}
for(const mesh of doc.meshes)for(const p of mesh.primitives){
  p.indices=accessorMap.get(p.indices);
  for(const name of Object.keys(p.attributes))p.attributes[name]=accessorMap.get(p.attributes[name]);
}
for(const skin of doc.skins??[])if(skin.inverseBindMatrices!==undefined)skin.inverseBindMatrices=accessorMap.get(skin.inverseBindMatrices);
for(const animation of doc.animations??[])for(const sampler of animation.samplers){
  sampler.input=accessorMap.get(sampler.input);sampler.output=accessorMap.get(sampler.output);
}
const roles=new Map();
const imageIndex=textureIndex=>{
  const texture=doc.textures[textureIndex];
  return texture.extensions?.EXT_texture_webp?.source??texture.source;
};
const addRole=(textureInfo,role)=>{
  if(!textureInfo)return;
  const index=imageIndex(textureInfo.index);
  if(!roles.has(index))roles.set(index,new Set());
  roles.get(index).add(role);
};
for(const material of doc.materials??[]){
  addRole(material.pbrMetallicRoughness?.baseColorTexture,'color');
  addRole(material.pbrMetallicRoughness?.metallicRoughnessTexture,'data');
  addRole(material.normalTexture,'normal');
  addRole(material.occlusionTexture,'data');
  addRole(material.emissiveTexture,'color');
}
const images=[],textureRecords=[];
for(let i=0;i<(doc.images??[]).length;i++){
  const image=doc.images[i],view=doc.bufferViews[image.bufferView];
  if(!view||image.uri)throw new Error('Expected embedded source texture.');
  const raw=bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
  const role=roles.get(i)??new Set(['data']);
  const limit=role.has('color')?2048:role.has('normal')?1024:512;
  const metadata=await sharp(raw).metadata();
  const resized=sharp(raw).resize({width:limit,height:limit,fit:'inside',withoutEnlargement:true});
  const encoded=await resized.webp({quality:95,lossless:!role.has('color')&&!role.has('normal'),effort:6}).toBuffer();
  const out=await sharp(encoded).metadata();
  const bufferView=views.length;views.push({buffer:0,...append(encoded)});
  images.push({...image,mimeType:'image/webp',bufferView});
  textureRecords.push({roles:[...role],source:[metadata.width,metadata.height],size:[out.width,out.height],bytes:encoded.length});
}
for(const texture of doc.textures??[]){
  const original=texture.extensions?.EXT_texture_webp?.source??texture.source;
  texture.extensions={...texture.extensions,EXT_texture_webp:{source:original}};
  delete texture.source;
}
doc.asset={...doc.asset,generator:'OnTop NPC runtime build / meshoptimizer 1.1.1 / sharp'};
doc.accessors=accessors;doc.bufferViews=views;doc.images=images;
doc.buffers=[{byteLength:offset},{byteLength:fallback,extensions:{EXT_meshopt_compression:{fallback:true}}}];
doc.extensionsUsed=[...new Set([...(doc.extensionsUsed??[]),'EXT_meshopt_compression','EXT_texture_webp'])];
doc.extensionsRequired=[...new Set([...(doc.extensionsRequired??[]),'EXT_meshopt_compression','EXT_texture_webp'])];
const json=Buffer.from(JSON.stringify(doc)), padded=Buffer.alloc((json.length+3)&~3,32);json.copy(padded);
const binary=Buffer.concat(chunks),header=Buffer.alloc(20),bh=Buffer.alloc(8);
header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+binary.length,8);
header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);bh.writeUInt32LE(binary.length,0);bh.writeUInt32LE(0x004e4942,4);
const output=Buffer.concat([header,padded,bh,binary]);
await fs.mkdir(path.dirname(destination),{recursive:true});
await fs.writeFile(destination,output);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const receipt={source:{file:source,bytes:input.length,sha256:sha(input)},runtime:{file:destination,bytes:output.length,sha256:sha(output)},
  meshes:meshRecords,textures:textureRecords,skins:doc.skins?.length??0,
  animations:(doc.animations??[]).map(a=>({name:a.name,channels:a.channels.length})),
  policy:{targetTriangles,errorLimit:.004,color:2048,normal:1024,data:512,meshoptRoundTrip:'attributes exact; triangle winding/topology equivalent',retainedVertexAttributes:'byte-identical',sourcePreserved:true}};
await fs.writeFile(destination.replace(/\.glb$/i,'.manifest.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));
