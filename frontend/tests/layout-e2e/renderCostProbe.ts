import {_roots} from '@react-three/fiber'
import type {Mesh,Texture,Material} from 'three'

export function renderCostProbe(){
  const {gl,scene}=_roots.get(document.querySelector('canvas')!)!.store.getState()
  const textures=new Set<Texture>(),materials=new Set<Material>()
  let meshes=0
  const heavy:Array<{name:string;triangles:number}>=[]
  scene.traverse(o=>{const mesh=o as Mesh;if(!mesh.isMesh)return;meshes++
    let visible=true
    for(let parent:typeof mesh|null=mesh;parent;parent=parent.parent as typeof mesh|null)if(!parent.visible)visible=false
    if(visible)heavy.push({name:mesh.name||mesh.parent?.name||mesh.parent?.parent?.name||'',triangles:(mesh.geometry.index?.count??mesh.geometry.attributes.position?.count??0)/3*('count' in mesh?Number(mesh.count):1)})
    for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
      materials.add(m)
      for(const value of Object.values(m))if(value&&typeof value==='object'&&'isTexture' in value)textures.add(value as Texture)
    }
  })
  return {drawCalls:gl.info.render.calls,triangles:gl.info.render.triangles,geometries:gl.info.memory.geometries,gpuTextures:gl.info.memory.textures,materialTextures:textures.size,materials:materials.size,meshes,programs:gl.info.programs?.length??0,dpr:gl.getPixelRatio(),width:gl.domElement.width,height:gl.domElement.height,shadows:gl.shadowMap.enabled,heavy:heavy.sort((a,b)=>b.triangles-a.triangles).slice(0,20)}
}
