import * as THREE from 'three';
function texture(canvas,name){const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.name=name;t.anisotropy=4;return t;}
export function createTraditionalPlaySignTexture(){
 const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=288;const c=canvas.getContext('2d');if(!c)throw new Error('Canvas 2D unavailable');
 c.fillStyle='#98613b';c.fillRect(0,0,1280,288);for(let i=0;i<8;i++){c.strokeStyle=i%2?'#a36c42':'#8c5836';c.lineWidth=2;c.beginPath();c.moveTo(0,24+i*35);c.bezierCurveTo(320,10+i*35,930,40+i*35,1280,24+i*35);c.stroke();}
 c.strokeStyle='#d6a665';c.lineWidth=10;c.strokeRect(12,12,1256,264);c.strokeStyle='#e8c58c';c.lineWidth=3;c.strokeRect(26,26,1228,236);
 c.textAlign='center';c.textBaseline='middle';c.font='bold 165px "Malgun Gothic",sans-serif';c.fillStyle='#5c3b25';c.fillText('전통놀이존',646,151,1030);c.fillStyle='#fff0c9';c.fillText('전통놀이존',640,143,1030);
 for(const x of[62,1218])for(const y of[65,224]){for(let i=0;i<5;i++){const a=i/5*Math.PI*2;c.fillStyle='#e4b267';c.beginPath();c.ellipse(x+Math.sin(a)*15,y+Math.cos(a)*15,11,13,a,0,Math.PI*2);c.fill();}c.fillStyle='#a9603e';c.beginPath();c.arc(x,y,7,0,Math.PI*2);c.fill();}
 return texture(canvas,'original-traditional-play-zone-sign');
}
export function createYutMatTexture(){
 const canvas=document.createElement('canvas');canvas.width=768;canvas.height=576;const c=canvas.getContext('2d');if(!c)throw new Error('Canvas 2D unavailable');c.fillStyle='#e9d4a8';c.fillRect(0,0,768,576);c.strokeStyle='#b27048';c.lineWidth=7;c.strokeRect(18,18,732,540);c.strokeStyle='#d4b57f';c.lineWidth=3;c.strokeRect(32,32,704,512);
 const left=113,right=655,top=82,bottom=494,cx=384,cy=288,points=[];for(let i=0;i<5;i++){points.push([left+(right-left)*i/5,top],[right,top+(bottom-top)*i/5],[right-(right-left)*i/5,bottom],[left,bottom-(bottom-top)*i/5]);}
 c.strokeStyle='#a34835';c.lineWidth=5;c.strokeRect(left,top,right-left,bottom-top);for(const [x,y]of[[left,top],[right,top],[right,bottom],[left,bottom]]){c.beginPath();c.moveTo(x,y);c.lineTo(cx,cy);c.stroke();for(let j=1;j<3;j++)points.push([x+(cx-x)*j/3,y+(cy-y)*j/3]);}points.push([cx,cy]);for(const[x,y]of points){const corner=(x===left||x===right)&&(y===top||y===bottom),r=corner||x===cx&&y===cy?19:12;c.fillStyle='#f6e6bf';c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();c.strokeStyle='#9f4a37';c.lineWidth=corner?6:4;c.stroke();}return texture(canvas,'original-yut-board-mat');
}
