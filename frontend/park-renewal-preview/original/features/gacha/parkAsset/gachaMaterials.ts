import {Color,MeshPhysicalMaterial,MeshStandardMaterial} from 'three'
import type {PropFinish} from '../../../../../src/world/art/propGeometry.ts'
import {getGachaReflectionData} from '../../../world/art/outdoorReflectionData.ts'
import {restorePrefilteredReflection} from '../../../world/art/ornamentTextures.ts'
import {createGachaReflection} from './gachaReflection.ts'

// Asset-local reflection, generated in memory. No global scene/environment changes or requests.
const bakedReflection=getGachaReflectionData()
const reflection=bakedReflection?restorePrefilteredReflection(bakedReflection):createGachaReflection()
if(bakedReflection)performance.mark('park-static-gacha-reflection-ready')
const wood=new MeshPhysicalMaterial({vertexColors:true,roughness:.5,metalness:.02,clearcoat:.28,clearcoatRoughness:.44,envMap:reflection,envMapIntensity:.4})
wood.onBeforeCompile=shader=>{
 shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 gachaWoodPosition;').replace('#include <begin_vertex>','#include <begin_vertex>\ngachaWoodPosition=position;')
 shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 gachaWoodPosition;').replace('#include <color_fragment>',`#include <color_fragment>
  float angle=atan(gachaWoodPosition.x,gachaWoodPosition.z);
  float grain=sin(angle*155.0+sin(gachaWoodPosition.y*4.8+angle*9.0)*.8);
  float fine=sin(angle*390.0+gachaWoodPosition.y*2.0);
  diffuseColor.rgb*=.97+.028*grain+.008*fine;`)
}
wood.customProgramCacheKey=()=> 'gacha-walnut-grain-v1'
export const gachaMaterials:Record<PropFinish,MeshStandardMaterial>={
 wood,
 gold:new MeshPhysicalMaterial({color:'#ffdda1',vertexColors:true,metalness:.72,roughness:.27,clearcoat:.45,envMap:reflection,envMapIntensity:1.05}),
 metal:new MeshStandardMaterial({vertexColors:true,metalness:.5,roughness:.35,envMap:reflection}),
 tile:new MeshPhysicalMaterial({vertexColors:true,roughness:.48,metalness:.08,clearcoat:.25,clearcoatRoughness:.5,envMap:reflection,envMapIntensity:.45,side:2}),
 paint:new MeshPhysicalMaterial({vertexColors:true,roughness:.37,metalness:.02,clearcoat:.5,envMap:reflection,envMapIntensity:.4}),
 stone:new MeshStandardMaterial({vertexColors:true,roughness:.85}),
 glow:new MeshStandardMaterial({vertexColors:true,emissive:'#ffc064',emissiveIntensity:.65,roughness:.7}),
}
export const capsuleGold=new MeshPhysicalMaterial({color:'#e3b349',metalness:.68,roughness:.23,envMap:reflection,envMapIntensity:1.0})
export const worldCapsuleColors=['#c51e32','#7326a8','#1684ad','#689d40'].map(color=>new Color(color))
export const capsuleShellMaterial=new MeshPhysicalMaterial({color:'#ffffff',metalness:.04,roughness:.24,clearcoat:.8,clearcoatRoughness:.16,envMap:reflection,envMapIntensity:.75})
