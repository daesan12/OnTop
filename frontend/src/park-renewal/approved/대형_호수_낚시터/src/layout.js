export const LAND_SCALE=1.25;
export const LAYOUT=Object.freeze({
  water:[15.175,10.8],outer:[20.125,15.625],pathTop:.3735,
  pavilion:{position:[-3.1,.375,-4.75],rotation:-Math.PI/2,radius:4.55},
  shop:{position:[-16.8,.01,1.45],rotation:Math.PI/2,scale:[1.8,1.35,1.8]},
  deck:{position:[11.4,0,5.3],rotation:.75,width:7.2,depth:5.2,top:.48},
  shopDeck:{position:[-12.25,0,1.45],rotation:Math.PI/2},
  bridge:{position:[10.8,.04,-7.5],rotation:-.08,scale:[1.25,1.15,1.35]},
  waterfall:{position:[2.1,-.015,-8.15],scale:1.15},
  bank:[[1.6,-10],[2.5,-11.1],[9.2,-11.4],[10.4,-9],[9,-6],[7,-5.2],[5.6,-5.9],[5.6,-7.2],[2.5,-7.2],[1.6,-8.6]],
});
export function worldXZ(position,rotation,x,z){return[position[0]+x*Math.cos(rotation)+z*Math.sin(rotation),position[2]-x*Math.sin(rotation)+z*Math.cos(rotation)];}
const bridgeWest=worldXZ(LAYOUT.bridge.position,LAYOUT.bridge.rotation,-2.97*LAYOUT.bridge.scale[0],0);
const bridgeEast=worldXZ(LAYOUT.bridge.position,LAYOUT.bridge.rotation,2.97*LAYOUT.bridge.scale[0],0);
const deckGate=worldXZ(LAYOUT.deck.position,LAYOUT.deck.rotation,0,2.55);
const deckShore=worldXZ(LAYOUT.deck.position,LAYOUT.deck.rotation,0,4.15);
export const CONNECTIONS=Object.freeze([
  {id:'pavilion-walkway',width:1.95,points:[[-16.2,-4.75],[-7.14,-4.75]],top:.455},
  {id:'shop-approach',width:1.85,points:[[-15.6,6.3],[-12.25,6.3],[-12.25,4.99]],top:.455,endJoin:true,railEndExtension:.09},
  {id:'deck-approach',width:2.10,points:[deckShore,deckGate],top:.455,endJoin:true,railEndExtension:.05},
  {id:'waterfall-walkway',width:1.85,points:[[5.8,-11.8],[5.8,-8.0],bridgeWest],top:.455},
  {id:'bridge-shore-landing',width:2.15,points:[bridgeEast,worldXZ(LAYOUT.bridge.position,LAYOUT.bridge.rotation,4.0,0)],top:.455},
]);
export function distanceToPath(x,z,points){let best=Infinity;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));best=Math.min(best,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));}return best;}
export const inAccess=(x,z,margin=0)=>CONNECTIONS.some(c=>distanceToPath(x,z,c.points)<c.width/2+margin);
export function inBank(x,z){let hit=false;for(let i=0,j=LAYOUT.bank.length-1;i<LAYOUT.bank.length;j=i++){const a=LAYOUT.bank[i],b=LAYOUT.bank[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
export function inFacility(x,z){if(inBank(x,z))return true;for(const q of[LAYOUT.deck,LAYOUT.shopDeck]){const dx=x-q.position[0],dz=z-q.position[2],xx=dx*Math.cos(q.rotation)-dz*Math.sin(q.rotation),zz=dx*Math.sin(q.rotation)+dz*Math.cos(q.rotation);if(Math.abs(xx)<3.85&&Math.abs(zz)<2.9)return true;}return false;}

