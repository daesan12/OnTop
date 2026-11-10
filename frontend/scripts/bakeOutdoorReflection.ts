import {PMREMGenerator,REVISION,WebGLRenderer,WebGLRenderTarget,HalfFloatType,LinearSRGBColorSpace,PlaneGeometry,RawShaderMaterial,GLSL3,Mesh,Scene,OrthographicCamera} from 'three'
import {outdoorReflection,restoreOutdoorReflection} from '../src/world/art/ornamentTextures'
import {createGachaReflection} from '../src/features/gacha/parkAsset/gachaReflection'

/** Authoring-only GPU capture. Never imported by the application or CI build. */
export function bakeOutdoorReflection(textureName:'outdoor'|'gacha'='outdoor'){
  const renderer=new WebGLRenderer({antialias:false,alpha:false})
  const generator=new PMREMGenerator(renderer),source=textureName==='outdoor'?outdoorReflection():createGachaReflection()
  let target:ReturnType<PMREMGenerator['fromEquirectangular']>|undefined
  try {
    const sourcePixels=source.image.data
    if(!(sourcePixels instanceof Uint8Array))throw Error('Unsupported outdoor reflection source')
    target=generator.fromEquirectangular(source)
    const {width,height,texture}=target,data=new Uint16Array(width*height*4)
    renderer.readRenderTargetPixels(target,0,0,width,height,data)
    if(!data.some(value=>value!==0))throw Error('Empty outdoor reflection capture')
    const restored=restoreOutdoorReflection({width,height,data}),copy=new WebGLRenderTarget(width,height,{type:HalfFloatType,colorSpace:LinearSRGBColorSpace,depthBuffer:false})
    const geometry=new PlaneGeometry(2,2),material=new RawShaderMaterial({glslVersion:GLSL3,
      uniforms:{source:{value:restored}},vertexShader:'in vec3 position;void main(){gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:'precision highp float;uniform sampler2D source;out vec4 outputColor;void main(){outputColor=texelFetch(source,ivec2(gl_FragCoord.xy),0);}'})
    try {
      renderer.setRenderTarget(copy);renderer.render(new Scene().add(new Mesh(geometry,material)),new OrthographicCamera())
      const uploaded=new Uint16Array(data.length)
      renderer.readRenderTargetPixels(copy,0,0,width,height,uploaded)
      if(uploaded.some((value,i)=>value!==data[i]))throw Error('Outdoor reflection upload changed HalfFloat pixels')
    }finally {restored.dispose();copy.dispose();geometry.dispose();material.dispose();renderer.setRenderTarget(null)}
    return {format:'ontop.park-pmrem.v1',textureName,sourceColorSpace:source.colorSpace,sourceWidth:source.image.width,sourceHeight:source.image.height,
      sourceType:source.type,sourceFormat:source.format,sourceMapping:source.mapping,sourceMinFilter:source.minFilter,sourceMagFilter:source.magFilter,sourceFlipY:source.flipY,threeRevision:REVISION,width,height,
      type:texture.type,formatId:texture.format,mapping:texture.mapping,
      minFilter:texture.minFilter,magFilter:texture.magFilter,colorSpace:texture.colorSpace,
      flipY:texture.flipY,data:Array.from(data),source:Array.from(sourcePixels)}
  }finally {
    target?.dispose();generator.dispose();source.dispose();renderer.dispose();renderer.forceContextLoss()
  }
}
