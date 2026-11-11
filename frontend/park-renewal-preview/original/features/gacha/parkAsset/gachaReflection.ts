import {DataTexture,EquirectangularReflectionMapping,LinearFilter,RGBAFormat,SRGBColorSpace} from 'three'

/** Original asset-local lighting. Keep its sRGB source separate from the park probe. */
export function createGachaReflection(){
 const width=128,height=64,data=new Uint8Array(width*height*4)
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const t=y/(height-1),soft=Math.sin(t*Math.PI),pane=(x>18&&x<30||x>83&&x<92)&&y>22&&y<48
  const rgb=pane?[255,249,228]:t>.55?[165+soft*65,185+soft*55,209+soft*38]:[100+soft*72,77+soft*65,54+soft*55]
  const k=(y*width+x)*4;data[k]=rgb[0]!;data[k+1]=rgb[1]!;data[k+2]=rgb[2]!;data[k+3]=255
 }
 const reflection=new DataTexture(data,width,height,RGBAFormat);reflection.mapping=EquirectangularReflectionMapping;reflection.colorSpace=SRGBColorSpace;reflection.magFilter=LinearFilter;reflection.minFilter=LinearFilter;reflection.needsUpdate=true
 return reflection
}
