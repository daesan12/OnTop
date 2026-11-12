import {LAKE,BRIDGE,site,onFishingDeck,type Point} from './plan.ts'


export function lakeFenceOpening(x:number,z:number){
 const dock=site('dock')
 return x<LAKE.x&&Math.abs(z-BRIDGE.z)<BRIDGE.width/2+.4
  ||z>LAKE.z&&Math.abs(x-dock.x)<5.6&&Math.abs(z-dock.z)<6
  ||onFishingDeck(x,z,.7)
}
export function lakeFenceSegments(){
 const n=180,segments:{a:Point;z:Point}[]=[]
 for(let i=0;i<n;i++){
  const point=(j:number):Point=>{const a=j/n*Math.PI*2;return[LAKE.x+Math.cos(a)*(LAKE.rx+.9),LAKE.z+Math.sin(a)*(LAKE.rz+.9)]}
  const a=point(i),z=point(i+1)
  const ia=lakeFenceOpening(...a),ib=lakeFenceOpening(...z)
  if(!ia&&!ib){segments.push({a,z});continue}if(ia&&ib)continue
  let lo=0,hi=1;for(let j=0;j<24;j++){const t=(lo+hi)/2;if(lakeFenceOpening(a[0]+(z[0]-a[0])*t,a[1]+(z[1]-a[1])*t)===ia)lo=t;else hi=t}const t=(lo+hi)/2,p:Point=[a[0]+(z[0]-a[0])*t,a[1]+(z[1]-a[1])*t];segments.push(ia?{a:p,z}:{a,z:p})
 }
 return segments
}

export function bridgeApproachGuards(shore = lakeFenceSegments()) {
 const segments: ReturnType<typeof lakeFenceSegments> = []
 for (const side of [-1, 1]) {
  const railZ = BRIDGE.z + side * BRIDGE.width / 2
  const openingZ = BRIDGE.z + side * (BRIDGE.width / 2 + .4)
  const shoreEnd = shore.flatMap(({a,z}) => [a,z])
   .find(([x,z]) => x < LAKE.x && Math.abs(z-openingZ) < .0001)
  if (shoreEnd) segments.push({a:shoreEnd,z:[shoreEnd[0],railZ]})

  // Follow the island shore to the bridge rail, closing the low route
  // around the side of the arch while keeping the stone landing open.
  const points = Array.from({length:9}, (_, i): Point => {
   const offset = BRIDGE.width / 2 + i
   const {x,rx,rz} = LAKE.island
   return [x - rx * Math.sqrt(1 - (offset / rz) ** 2) + .65, BRIDGE.z + side * offset]
  })
  for (let i = 1; i < points.length; i++) segments.push({a:points[i-1]!,z:points[i]!})
 }
 return segments
}
