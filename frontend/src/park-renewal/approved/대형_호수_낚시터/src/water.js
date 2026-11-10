import{THREE}from'./primitives.js';
import{closedRoll}from'./pavilion-roof.js';
import{rock}from'./garden.js';
function seeded(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
export function createWaterTextures(){
  if(typeof document==='undefined')return{waterColor:null,waterNormal:null};
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=2048;const c=canvas.getContext('2d'),r=seeded(230831);
  const g=c.createRadialGradient(900,850,50,1024,1024,1320);g.addColorStop(0,'#176c8b');g.addColorStop(.55,'#258ba5');g.addColorStop(.82,'#4daab4');g.addColorStop(1,'#83c6c3');c.fillStyle=g;c.fillRect(0,0,2048,2048);
  // Broad low-contrast patches and fine disconnected curved glints, all baked locally.
  for(let i=0;i<160;i++){const x=r()*2048,y=r()*2048;c.fillStyle=i%2?'#77d4ce0a':'#1047670b';c.beginPath();c.ellipse(x,y,40+r()*120,8+r()*25,0,0,Math.PI*2);c.fill();}
  for(let i=0;i<2600;i++){const x=r()*2048,y=r()*2048,len=4+r()*30;c.strokeStyle=i%8===0?'#d8efdf99':i%3===0?'#99d9d65c':'#74c4cf40';c.lineWidth=.7+r()*1.6;c.beginPath();c.moveTo(x,y);c.bezierCurveTo(x+len*.3,y-2,x+len*.65,y+2,x+len,y);c.stroke();}
  for(let band=0;band<3;band++)for(let i=0;i<50;i++){const y=630+i*8+(r()-.5)*5,x=860+(r()-.5)*(18+i*.8)+band*3;c.strokeStyle=i%3===0?'#efd49760':'#c7e3c53b';c.lineWidth=1+r()*1.7;c.beginPath();c.moveTo(x-3-r()*5,y);c.lineTo(x+5+r()*8,y);c.stroke();}
  const color=new THREE.CanvasTexture(canvas);color.name='lake-water-colour';color.colorSpace=THREE.SRGBColorSpace;color.anisotropy=8;
  const normalCanvas=document.createElement('canvas');normalCanvas.width=512;normalCanvas.height=512;const n=normalCanvas.getContext('2d'),data=n.createImageData(512,512);
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){const a=(x/512)*Math.PI*2,b=(y/512)*Math.PI*2,dx=.17*Math.cos(a*11+b*5)+.08*Math.sin(a*23-b*7),dy=.13*Math.cos(b*17-a*3)+.06*Math.sin(a*7+b*29),v=new THREE.Vector3(dx,dy,1).normalize(),i=(y*512+x)*4;data.data[i]=(v.x*.5+.5)*255;data.data[i+1]=(v.y*.5+.5)*255;data.data[i+2]=(v.z*.5+.5)*255;data.data[i+3]=255;}n.putImageData(data,0,0);const normal=new THREE.CanvasTexture(normalCanvas);normal.name='lake-water-normal';normal.wrapS=normal.wrapT=THREE.RepeatWrapping;normal.repeat.set(5,5);return{waterColor:color,waterNormal:normal};
}
function curtain(){
  const path=new THREE.CatmullRomCurve3([[0,2.95,-.55],[0,2.94,-.02],[0,2.68,.35],[0,1.56,.66],[0,.42,1.50],[0,.12,2.08]].map(p=>new THREE.Vector3(...p))),nu=16,nv=28,p=[],ix=[],colors=[];
  for(let j=0;j<=nv;j++){const t=j/nv,at=path.getPoint(t),width=.70+.06*Math.sin(t*5);for(let i=0;i<=nu;i++){const u=i/nu,x=(u-.5)*2*width,fold=.017*Math.sin(u*45+t*2)+.009*Math.sin(u*83-t*9);p.push(at.x+x,at.y+fold*.4,at.z+fold);const col=new THREE.Color().setHSL(.51,.35,.67+.12*(.5+.5*Math.sin(u*42)));colors.push(col.r,col.g,col.b);}}
  for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){const a=j*(nu+1)+i,b=a+nu+1;ix.push(a,b,a+1,a+1,b,b+1);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();return{geometry:g,path};
}
export function waterfall(b){
  for(let i=0;i<18;i++){const a=i*2.4,r=.50+(i%4)*.34;let x=Math.sin(a)*r;const z=-.60+Math.cos(a)*r*.59,y=.28+(i%5)*.51;if(Math.abs(x)<.95&&y>.5)x=(x<0?-1:1)*(1.32+(i%2)*.15);rock(b,[x,y,z],[.68+(i%3)*.11,.57+(i%2)*.13,.62],['#969f99','#a9afa5','#c0c2b4'][i%3],i);}
  // A supported header pool feeds the curtain; the splash sits above lake level.
  rock(b,[0,2.43,-.80],[.83,.43,.68],'#9aa79e',23);
  b.cylinder('stone','#95a39a',[0,2.66,-.91],.84,.95,.53,[0,.19,0],10);
  for(const side of[-1,1])rock(b,[side*.78,2.91,-.91],[.25,.19,.43],'#a5afa3',31+side);
  rock(b,[0,2.91,-1.29],[.55,.17,.22],'#adb5a8',37);
  const head=new THREE.CircleGeometry(1,32);head.rotateX(-Math.PI/2);b.add('water',head,'#4cabb6',[0,2.935,-.91],[.69,1,.40]);
  const{geometry,path}=curtain();b.add('cascade',geometry,'#95d9df');const cg=b.parts.cascade.at(-1),cp=cg.attributes.position,cc=cg.attributes.color;for(let i=0;i<cp.count;i++){const x=cp.getX(i),y=cp.getY(i),col=new THREE.Color().setHSL(.51,.46,.45+.21*(.5+.5*Math.sin(x*47+y*.8)));cc.setXYZ(i,col.r,col.g,col.b);}
  for(let i=0;i<11;i++){const u=(i/10-.5)*1.22;const pts=Array.from({length:24},(_,j)=>{const t=j/23,v=path.getPoint(t);return v.add(new THREE.Vector3(u+.014*Math.sin(t*11+i),.008,.032));});b.add('foam',closedRoll(pts,i%3===0?.012:.006,24,3),'#d5f1ec');}
  for(let i=0;i<18;i++){const a=i/18*Math.PI*2;b.add('foam',new THREE.SphereGeometry(1,8,5),'#d9f2e9',[Math.sin(a)*(.76+(i%3)*.07),.195,2.06+Math.cos(a)*.33],[.16,.034,.10]);}
  for(let k=0;k<3;k++){const pts=Array.from({length:44},(_,i)=>{const a=(i/43)*Math.PI*2;return new THREE.Vector3(Math.sin(a)*(.8+k*.20),.185,2.12+Math.cos(a)*(.32+k*.11));});b.add('foam',closedRoll(pts,.009,44,3),'#c5e9e0');}
}
