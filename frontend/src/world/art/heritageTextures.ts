import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
let cached: { wood: CanvasTexture; mineral: CanvasTexture } | undefined
/** Deterministic, local, shared grain: no external images or per-frame texture work. */
export function heritageTextures() {
  if(cached)return cached
  const make=(wood:boolean)=>{
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256
    const c=canvas.getContext('2d')!,pixels=c.createImageData(256,256)
    let seed=wood?391:829
    const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296}
    for(let y=0;y<256;y++)for(let x=0;x<256;x++){
      const i=(y*256+x)*4,wave=x+Math.sin(y*.026)*1.6+Math.sin(y*.073)*.5
      const grain=wood?Math.pow((Math.sin(wave*.77)+1)/2,12)*17+Math.pow((Math.sin(wave*2.31)+1)/2,18)*8:noise()*8
      const v=248-grain-noise()*(wood?7:12)
      pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;pixels.data[i+3]=255
    }
    c.putImageData(pixels,0,0)
    const texture=new CanvasTexture(canvas);texture.wrapS=texture.wrapT=RepeatWrapping;texture.colorSpace=SRGBColorSpace;texture.anisotropy=4
    return texture
  }
  cached={wood:make(true),mineral:make(false)}
  return cached
}
