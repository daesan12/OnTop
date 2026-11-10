import{THREE}from'./primitives.js';
export function arcStone(b,innerX,innerZ,outerX,outerZ,a0,a1,y,height,color,bevel=.014){
  const points=[[Math.sin(a0)*outerX,-Math.cos(a0)*outerZ],[Math.sin(a1)*outerX,-Math.cos(a1)*outerZ],[Math.sin(a1)*innerX,-Math.cos(a1)*innerZ],[Math.sin(a0)*innerX,-Math.cos(a0)*innerZ]],s=new THREE.Shape();points.forEach(([x,z],i)=>i?s.lineTo(x,z):s.moveTo(x,z));s.closePath();const g=new THREE.ExtrudeGeometry(s,{depth:height,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:1,steps:1,curveSegments:1});g.translate(0,0,-height/2);g.rotateX(-Math.PI/2);b.add('stone',g,color,[0,y,0]);
}
export function pathStones(b){
  for(let row=0;row<3;row++){const n=124+row*7,offset=(row%2)*.5;for(let i=0;i<n;i++){const a0=(i+offset)/n*Math.PI*2+.0016,a1=(i+1+offset)/n*Math.PI*2-.0016;arcStone(b,12.47+row*.70+.012,8.97+row*.70+.012,13.17+row*.70-.012,9.67+row*.70-.012,a0,a1,.327,.065,['#bdb6a5','#c8bfad','#c4baa7','#b4af9f'][(i*7+row)%4]);}}
}
export function shoreStones(b){for(let i=0;i<108;i++){const a0=i/108*Math.PI*2+.0018,a1=(i+1)/108*Math.PI*2-.0018;arcStone(b,12.12,8.62,12.48,8.98,a0,a1,.15,.44,['#9ea59c','#b3b5a7','#a8afa2'][i%3],.018);}}
