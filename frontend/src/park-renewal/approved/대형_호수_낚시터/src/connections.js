import{THREE}from'./primitives.js';
import{post,rope}from'./props.js';
import{worldXZ}from'./layout.js';
/** Closed XZ footprint. The explicit top face also fills all mitred path joints. */
export function footprint(b,points,top,height,kind,color){const s=new THREE.Shape();points.forEach(([x,z],i)=>i?s.lineTo(x,-z):s.moveTo(x,-z));s.closePath();const g=new THREE.ExtrudeGeometry(s,{depth:height,bevelEnabled:false,steps:1,curveSegments:1});g.rotateX(-Math.PI/2);g.translate(0,top-height,0);b.add(kind,g,color);}
function frames(points,width){const dirs=points.slice(1).map((p,i)=>new THREE.Vector2(p[0]-points[i][0],p[1]-points[i][1]).normalize()),normals=dirs.map(d=>new THREE.Vector2(-d.y,d.x));return points.map((p,i)=>{const n=i===0?normals[0].clone():i===points.length-1?normals.at(-1).clone():normals[i-1].clone().add(normals[i]).normalize(),den=i===0||i===points.length-1?1:n.dot(normals[i]),offset=n.multiplyScalar(width/2/den);return{left:[p[0]+offset.x,p[1]+offset.y],right:[p[0]-offset.x,p[1]-offset.y]};});}
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
export function boardwalk(b,c){
  const fs=frames(c.points,c.width),baseFrames=frames(c.points,c.width);for(const[i,dir]of[[0,-1],[c.points.length-1,1]]){const a=c.points[i===0?0:i-1],z=c.points[i===0?1:i],len=Math.hypot(z[0]-a[0],z[1]-a[1]);for(const side of['left','right']){baseFrames[i][side][0]+=(z[0]-a[0])/len*.04*dir;baseFrames[i][side][1]+=(z[1]-a[1])/len*.04*dir;}}const outline=[...baseFrames.map(f=>f.left),...baseFrames.map(f=>f.right).reverse()];footprint(b,outline,c.top-.026,.145,'wood','#805b36');
  for(let k=1;k<fs.length;k++){
    const a=fs[k-1],z=fs[k],length=Math.hypot(c.points[k][0]-c.points[k-1][0],c.points[k][1]-c.points[k-1][1]),n=Math.ceil(length/.28);
    for(let i=0;i<n;i++){const t0=(i+.018)/n,t1=(i+1-.018)/n;footprint(b,[lerp(a.left,z.left,t0),lerp(a.left,z.left,t1),lerp(a.right,z.right,t1),lerp(a.right,z.right,t0)],c.top,.038,'wood',i%2?'#b77e44':'#c18a4e');}
  }
  // Continuous side rails meet at mitred corners; both access ends remain open.
  for(const side of['left','right']){const rail=[];for(let k=1;k<fs.length;k++){const a=fs[k-1][side],z=fs[k][side].slice();if(k===fs.length-1&&c.railEndExtension){const aa=c.points[k-1],zz=c.points[k],len=Math.hypot(zz[0]-aa[0],zz[1]-aa[1]);z[0]+=(zz[0]-aa[0])/len*c.railEndExtension;z[1]+=(zz[1]-aa[1])/len*c.railEndExtension;}const n=Math.ceil(Math.hypot(z[0]-a[0],z[1]-a[1])/1.7);for(let i=k===1?0:1;i<=n;i++)rail.push(lerp(a,z,i/n));}for(const[i,[x,z]]of rail.entries()){if(c.endJoin&&i===rail.length-1)continue;post(b,x,z,c.top);b.cylinder('wood','#785432',[x,(c.top-.35)/2,z],.082,.10,c.top+.35,[0,0,0],8);}for(let i=1;i<rail.length;i++)for(const h of[.48,.92])rope(b,[rail[i-1][0],c.top+h,rail[i-1][1]],[rail[i][0],c.top+h,rail[i][1]]);}
}
export function bridgeRailLinks(b,q,west,east){for(const[end,c,index]of[[-1,west,west.points.length-1],[1,east,0]]){const f=frames(c.points,c.width)[index],targets=[f.left,f.right];for(const side of[-1,1]){const p=worldXZ(q.position,q.rotation,end*2.4*q.scale[0],side*.83*q.scale[2]),nearest=targets.reduce((a,z)=>Math.hypot(z[0]-p[0],z[1]-p[1])<Math.hypot(a[0]-p[0],a[1]-p[1])?z:a);for(const h of[.48,.90])b.beam('wood','#ad743a',[p[0],q.position[1]+(.45+h)*q.scale[1],p[1]],[nearest[0],c.top+(h===.90?.92:.48),nearest[1]],.075,.075);}}}
