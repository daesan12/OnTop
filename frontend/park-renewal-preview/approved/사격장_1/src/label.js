import * as THREE from 'three';
/** Original browser canvas artwork. The caller owns the returned texture. */
export function createShootingRangeSignTexture(){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const c=canvas.getContext('2d');if(!c)throw new Error('Canvas 2D unavailable');
 c.fillStyle='#f4dfb5';c.fillRect(0,0,1024,256);c.strokeStyle='#ab4936';c.lineWidth=12;c.strokeRect(10,10,1004,236);c.strokeStyle='#cf9d55';c.lineWidth=3;c.strokeRect(24,24,976,208);
 c.fillStyle='#4b2d20';c.textAlign='center';c.textBaseline='middle';c.font='bold 158px "Malgun Gothic",sans-serif';c.fillText('사격장',512,132,615);
 for(const x of[119,905]){for(const[r,color]of[[55,'#ad4936'],[40,'#f4dfb5'],[28,'#ad4936'],[12,'#f4dfb5']]){c.fillStyle=color;c.beginPath();c.arc(x,130,r,0,Math.PI*2);c.fill();}c.strokeStyle='#674d36';c.lineWidth=5;c.beginPath();c.moveTo(x,130);c.lineTo(x+47,77);c.stroke();c.fillStyle='#ae4d38';c.beginPath();c.moveTo(x+40,83);c.lineTo(x+47,61);c.lineTo(x+53,71);c.lineTo(x+66,72);c.closePath();c.fill();}
 for(const x of[39,985])for(const y of[38,218]){const sx=x<100?1:-1,sy=y<100?1:-1;c.strokeStyle='#a94e39';c.lineWidth=5;c.beginPath();c.moveTo(x,y+sy*20);c.lineTo(x,y);c.lineTo(x+sx*20,y);c.lineTo(x+sx*20,y+sy*12);c.lineTo(x+sx*10,y+sy*12);c.lineTo(x+sx*10,y+sy*6);c.stroke();}
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;texture.name='original-korean-shooting-range-sign';return texture;
}
