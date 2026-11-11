type P=readonly[number,number]
export function clipHalfPlane(points:readonly P[],signed:(x:number,z:number)=>number):P[]{
 const out:P[]=[];for(let i=0;i<points.length;i++){const a=points[i]!,b=points[(i+1)%points.length]!,va=signed(...a),vb=signed(...b);if(va<=0)out.push(a);if((va<=0)!==(vb<=0)){const t=va/(va-vb);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t])}}return out
}
/** Quadratic corner fillets shared by rendered floors, terrain cutouts and walking support. */
export function roundedPolygon(points:readonly P[],radius=.8,steps=8):P[]{
 const out:P[]=[]
 for(let i=0;i<points.length;i++){const a=points[(i+points.length-1)%points.length]!,b=points[i]!,c=points[(i+1)%points.length]!,ab=Math.hypot(a[0]-b[0],a[1]-b[1]),bc=Math.hypot(c[0]-b[0],c[1]-b[1]),r=Math.min(radius,ab*.3,bc*.3),p:P=[b[0]+(a[0]-b[0])*r/ab,b[1]+(a[1]-b[1])*r/ab],q:P=[b[0]+(c[0]-b[0])*r/bc,b[1]+(c[1]-b[1])*r/bc];for(let j=0;j<=steps;j++){const t=j/steps;out.push([(1-t)**2*p[0]+2*t*(1-t)*b[0]+t*t*q[0],(1-t)**2*p[1]+2*t*(1-t)*b[1]+t*t*q[1]])}}
 return out
}
const polygonBounds=new WeakMap<object,{x0:number;x1:number;z0:number;z1:number}>()
export function inPolygon(x:number,z:number,points:readonly P[],margin=0){
 let bounds=polygonBounds.get(points);if(!bounds){bounds={x0:Math.min(...points.map(p=>p[0])),x1:Math.max(...points.map(p=>p[0])),z0:Math.min(...points.map(p=>p[1])),z1:Math.max(...points.map(p=>p[1]))};polygonBounds.set(points,bounds)}if(x<bounds.x0-margin||x>bounds.x1+margin||z<bounds.z0-margin||z>bounds.z1+margin)return false
 let inside=false,nearest=Infinity
 for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i]!,b=points[j]!;if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;if(margin>0){const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)||0));nearest=Math.min(nearest,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz))}}
 return inside||margin>0&&nearest<margin
}
export function stripePolygon(points:readonly P[],lo:number,hi:number):P[]{
 let out=[...points]
 for(const[bound,side]of[[lo,1],[hi,-1]]){const input=out;out=[];for(let i=0;i<input.length;i++){const a=input[i]!,b=input[(i+1)%input.length]!,ia=(a[1]-bound!)*side!>=0,ib=(b[1]-bound!)*side!>=0;if(ia)out.push(a);if(ia!==ib){const t=(bound!-a[1])/(b[1]-a[1]);out.push([a[0]+(b[0]-a[0])*t,bound!])}}}
 return out
}
