import { CanvasTexture, SRGBColorSpace, RepeatWrapping } from 'three'
import type { AnonymousNote } from '../../config/notes'
import { MEMO_ATLAS_GRID, MEMO_ATLAS_ROWS, NOTES_BOARD_VISIBLE_LIMIT } from './notesBoardLayout'
import { wrapMemoText } from './memoText'

/** Only acknowledged/read user text; unused cells remain transparent. */
export function createMemoAtlas(notes: readonly AnonymousNote[]) {
  const cell=512,canvas=document.createElement('canvas');canvas.width=cell*MEMO_ATLAS_GRID;canvas.height=cell*MEMO_ATLAS_ROWS
  const c=canvas.getContext('2d')!
  const papers=['#f2e2bd','#e3e2bd','#e3e7dc','#f0d7c5','#f4dfb0','#e8dfdf']
  notes.slice(0,NOTES_BOARD_VISIBLE_LIMIT).forEach((note,i)=>{
    c.save();c.translate(i%MEMO_ATLAS_GRID*cell,Math.floor(i/MEMO_ATLAS_GRID)*cell)
    c.beginPath();c.moveTo(12,8);c.lineTo(498,11);c.lineTo(503,486);c.lineTo(480,501);c.lineTo(8,495);c.closePath()
    c.fillStyle=papers[i]!;c.fill();c.strokeStyle='#9e81573b';c.lineWidth=2;c.stroke()
    c.save();c.clip()
    const shade=c.createLinearGradient(0,0,cell,cell);shade.addColorStop(0,'#fff9e436');shade.addColorStop(.7,'#fff0');shade.addColorStop(1,'#a3793233');c.fillStyle=shade;c.fillRect(0,0,cell,cell)
    c.fillStyle='#382d22';c.textAlign='left';c.textBaseline='top'
    // A complete grapheme (including emoji/combined Hangul) is never cut in half.
    c.font='500 48px "BusanDandiMyeongjo","Malgun Gothic",sans-serif'
    const lines=wrapMemoText(note.text,t=>c.measureText(t).width,420)
    lines.forEach((line,j)=>c.fillText(line,46,70+j*73))
    c.restore();c.restore()
  })
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.anisotropy=8
  return texture
}
export function createMemoWood() {
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=512
  const c=canvas.getContext('2d')!;c.fillStyle='#ede7d9';c.fillRect(0,0,256,512)
  let seed=809
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296}
  for(let i=0;i<190;i++){
    const x=random()*256;c.beginPath();c.moveTo(x,0)
    for(let y=0;y<=512;y+=32)c.lineTo(x+Math.sin(y*.017+i)*(.4+random()*1.2),y)
    c.strokeStyle=i%3?'#6d584821':'#fff8dc64';c.lineWidth=.3+random()*1.3;c.stroke()
  }
  for(const [x,y]of [[57,170],[193,365]])for(let ring=0;ring<6;ring++){
    c.beginPath();c.ellipse(x!,y!,2+ring*1.8,9+ring*5.5,.08,0,Math.PI*2);c.strokeStyle='#755b4222';c.lineWidth=.7;c.stroke()
  }
  const texture=new CanvasTexture(canvas);texture.wrapS=texture.wrapT=RepeatWrapping;texture.colorSpace=SRGBColorSpace;texture.anisotropy=4
  return texture
}
