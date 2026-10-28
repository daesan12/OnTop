import { CanvasTexture, SRGBColorSpace, RepeatWrapping } from 'three'
import { MEMO_ATLAS_GRID, memoSlips } from './notesBoardLayout'

/** One atlas for all thirteen physical decorative slips; all lettering is drawn locally. */
export function createMemoAtlas() {
  const cell=256,canvas=document.createElement('canvas');canvas.width=canvas.height=cell*MEMO_ATLAS_GRID
  const c=canvas.getContext('2d')!
  const papers=['#f2e2bd','#eee0c0','#f1dcb3','#f1e1bc','#e3e2bd','#e3e7dc','#f3dfb4','#e7d8bf','#f0d7c5','#f4dfb0','#e6e7dd','#eee1bd','#e8dfdf']
  let seed=731
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296}
  memoSlips.forEach((slip,i)=>{
    c.save();c.translate(i%4*cell,Math.floor(i/4)*cell)
    c.beginPath();c.moveTo(8,4);c.lineTo(249,7);c.lineTo(252,237);c.lineTo(240,249)
    for(let x=236;x>8;x-=11)c.lineTo(x,246+random()*5)
    c.lineTo(3,238);c.closePath();c.fillStyle=papers[i]!;c.fill()
    c.save();c.clip()
    const shade=c.createLinearGradient(0,0,256,256);shade.addColorStop(0,'#fff9e436');shade.addColorStop(.65,'#fff0');shade.addColorStop(1,'#a3793233');c.fillStyle=shade;c.fillRect(0,0,256,256)
    c.fillStyle='#8f7033';c.globalAlpha=.09
    for(let p=0;p<210;p++){const x=random()*256,y=random()*256;c.fillRect(x,y,random()*1.5+.4,.5)}
    c.restore()
    c.strokeStyle='#9e81573b';c.lineWidth=1.2;c.stroke()
    c.fillStyle='#483c2d';c.textAlign='center';c.textBaseline='middle'
    c.font='500 31px "BusanDandiMyeongjo","Batang",serif'
    slip.text.split('\n').forEach((line,j)=>{c.save();c.translate(128,78+j*41);c.rotate((i%3-1)*.016);c.fillText(line,0,0,216);c.restore()})
    c.strokeStyle=slip.ink;c.lineWidth=2.5;c.lineCap='round';c.lineJoin='round';c.globalAlpha=.78
    c.save();c.translate(160,193);c.rotate((i%2?.1:-.12))
    if(slip.doodle===0){
      c.beginPath();c.arc(0,0,20,.2,Math.PI*2+.1);c.stroke();c.beginPath();c.moveTo(-7,-6);c.lineTo(-7,-3);c.moveTo(7,-6);c.lineTo(7,-3);c.moveTo(-9,6);c.quadraticCurveTo(0,16,10,5);c.stroke()
    }else if(slip.doodle===1){
      c.beginPath();c.moveTo(-15,15);c.quadraticCurveTo(1,1,15,-18);c.moveTo(0,0);c.bezierCurveTo(-23,-17,-22,-25,-4,-15);c.quadraticCurveTo(0,-8,0,0);c.moveTo(1,0);c.bezierCurveTo(22,-18,33,-13,14,3);c.quadraticCurveTo(6,7,1,0);c.stroke()
    }else if(slip.doodle===2){
      c.beginPath();c.moveTo(0,19);c.bezierCurveTo(-40,-4,-16,-27,0,-9);c.bezierCurveTo(16,-29,39,-4,0,19);c.stroke()
    }else{
      c.beginPath();c.moveTo(-37,15);c.lineTo(-15,-12);c.lineTo(-1,6);c.lineTo(15,-20);c.lineTo(36,15);c.closePath();c.moveTo(-37,22);c.lineTo(36,22);c.stroke();c.beginPath();c.arc(-28,-18,6,0,Math.PI*2);c.stroke()
    }
    c.restore();c.globalAlpha=1
    // Faint corner blossom, away from handwriting.
    c.fillStyle=i%3?'#c6b38c70':'#cf9b8375'
    for(let petal=0;petal<5;petal++){const a=petal*Math.PI*2/5;c.beginPath();c.ellipse(28+Math.cos(a)*7,29+Math.sin(a)*7,5,6,a,0,Math.PI*2);c.fill()}
    c.restore()
  })
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.anisotropy=4
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
