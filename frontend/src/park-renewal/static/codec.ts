import {Box3,BufferAttribute,BufferGeometry,Sphere,Vector3} from 'three'
import type {StaticPark} from './store'

type Numeric = Float32Array | Float64Array | Uint16Array | Uint32Array
type Ref = {ref:number}
type Value = null | boolean | number | string | Ref
type Node =
  | {kind:'array';values:Value[]}
  | {kind:'numbers';data:Ref}
  | {kind:'object';values:Record<string,Value>}
  | {kind:'map';entries:[Value,Value][]}
  | {kind:'typed';type:string;offset:number;length:number}
  | {kind:'geometry';attributes:Record<string,{data:Ref;size:number;normalized:boolean}>;index:Ref|null;box:number[]|null;sphere:number[]|null;groups:BufferGeometry['groups'];drawRange:{start:number;count:number|null}}
const constructors = {Float32Array,Float64Array,Uint16Array,Uint32Array}
const MAGIC = 0x31535052 // RPS1; layout changes require a new version.

/** Lossless little-endian payload: Float64 height samples stay Float64, and
 * positions, normals, colours, indices and shared buffers keep their exact bits. */
export function encodeStaticPark(snapshot:StaticPark):Uint8Array {
  const nodes:Node[]=[],seen=new Map<object,Ref>(),chunks:Uint8Array[]=[]
  let offset=0
  const write=(value:unknown):Value=>{
    if(value===null||typeof value==='string'||typeof value==='boolean')return value
    if(typeof value==='number'){if(!Number.isFinite(value))throw Error('Non-finite park sample');return value}
    if(!value||typeof value!=='object')throw Error('Unsupported park value')
    const cached=seen.get(value);if(cached)return cached
    const ref={ref:nodes.length};seen.set(value,ref);nodes.push(null as unknown as Node)
    let node:Node
    if(ArrayBuffer.isView(value)){
      const array=value as Numeric,type=array.constructor.name
      if(!(type in constructors))throw Error('Unsupported park array '+type)
      const padding=(8-offset%8)%8
      if(padding){chunks.push(new Uint8Array(padding));offset+=padding}
      const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength)
      node={kind:'typed',type,offset,length:array.length};chunks.push(bytes);offset+=bytes.byteLength
    }else if((value as BufferGeometry).isBufferGeometry){
      const geometry=value as BufferGeometry
      const attributes=Object.fromEntries(Object.entries(geometry.attributes).map(([name,attribute])=>{
        if('isInterleavedBufferAttribute' in attribute)throw Error('Interleaved park attribute')
        return[name,{data:write(attribute.array) as Ref,size:attribute.itemSize,normalized:attribute.normalized}]
      }))
      node={kind:'geometry',attributes,index:geometry.index?write(geometry.index.array) as Ref:null,
        box:geometry.boundingBox?[...geometry.boundingBox.min.toArray(),...geometry.boundingBox.max.toArray()]:null,
        sphere:geometry.boundingSphere?[...geometry.boundingSphere.center.toArray(),geometry.boundingSphere.radius]:null,
        groups:geometry.groups,drawRange:{start:geometry.drawRange.start,count:Number.isFinite(geometry.drawRange.count)?geometry.drawRange.count:null}}
    }else if(value instanceof Map){
      node={kind:'map',entries:[...value].map(([key,item])=>[write(key),write(item)])}
    }else if(Array.isArray(value)){
      node=value.length&&value.every(v=>typeof v==='number')
        ?{kind:'numbers',data:write(new Float64Array(value)) as Ref}
        :{kind:'array',values:value.map(write)}
    }else node={kind:'object',values:Object.fromEntries(Object.entries(value).map(([key,item])=>[key,write(item)]))}
    nodes[ref.ref]=node;return ref
  }
  const root=write(snapshot),metadata=new TextEncoder().encode(JSON.stringify({root,nodes}))
  const base=Math.ceil((12+metadata.byteLength)/8)*8,output=new Uint8Array(base+offset),header=new DataView(output.buffer)
  header.setUint32(0,MAGIC,true);header.setUint32(4,metadata.byteLength,true);header.setUint32(8,base,true)
  output.set(metadata,12)
  let cursor=base;for(const chunk of chunks){output.set(chunk,cursor);cursor+=chunk.byteLength}
  return output
}

export function decodeStaticPark(buffer:ArrayBuffer):StaticPark {
  const header=new DataView(buffer)
  if(buffer.byteLength<12||header.getUint32(0,true)!==MAGIC)throw Error('Invalid static park header')
  const size=header.getUint32(4,true),base=header.getUint32(8,true)
  if(base%8||12+size>base||base>buffer.byteLength)throw Error('Invalid static park metadata')
  const {root,nodes}=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,12,size))) as {root:Ref;nodes:Node[]}
  const values=new Map<number,unknown>()
  const read=(value:Value):unknown=>{
    if(value===null||typeof value!=='object')return value
    if(values.has(value.ref))return values.get(value.ref)
    const node=nodes[value.ref];if(!node)throw Error('Invalid static park reference')
    let result:unknown
    switch(node.kind){
      case 'typed':{
        const Constructor=constructors[node.type as keyof typeof constructors]
        if(!Constructor||!Number.isInteger(node.offset)||!Number.isInteger(node.length)||node.offset<0||node.length<0||base+node.offset+node.length*Constructor.BYTES_PER_ELEMENT>buffer.byteLength)throw Error('Invalid static park buffer')
        result=new Constructor(buffer,base+node.offset,node.length);break
      }
      case 'numbers':result=Array.from(read(node.data) as Float64Array);break
      case 'array':result=node.values.map(read);break
      case 'object':result=Object.fromEntries(Object.entries(node.values).map(([key,item])=>[key,read(item)]));break
      case 'map':result=new Map(node.entries.map(([key,item])=>[read(key),read(item)]));break
      case 'geometry':{
        const geometry=new BufferGeometry()
        for(const[name,attribute]of Object.entries(node.attributes))geometry.setAttribute(name,new BufferAttribute(read(attribute.data) as Numeric,attribute.size,attribute.normalized))
        if(node.index)geometry.setIndex(new BufferAttribute(read(node.index) as Uint16Array|Uint32Array,1))
        if(node.box)geometry.boundingBox=new Box3(new Vector3(...node.box.slice(0,3)),new Vector3(...node.box.slice(3,6)))
        if(node.sphere)geometry.boundingSphere=new Sphere(new Vector3(...node.sphere.slice(0,3)),node.sphere[3])
        geometry.groups=node.groups;geometry.setDrawRange(node.drawRange.start,node.drawRange.count??Infinity)
        result=geometry;break
      }
      default:throw Error('Unknown static park node')
    }
    values.set(value.ref,result);return result
  }
  const snapshot=read(root) as StaticPark
  if(!(snapshot.forestField instanceof Float64Array)||!(snapshot.plantingField instanceof Float32Array)||!snapshot.ground?.grass?.isBufferGeometry||!snapshot.guards||!snapshot.jumpFence||!snapshot.guardArt)throw Error('Incomplete static park')
  return snapshot
}
