/** Authoring source for the accepted FE preview. No service/Java map is changed. */
export type MapPoint = readonly [number,number]
export type MapRoute = {id:string;points:readonly MapPoint[];width:number}
const MAIN_AXIS_X=0
const plaza={x:MAIN_AXIS_X,z:46,radius:7.4,pavingRadius:24,width:48,depth:48}
const sites = {
  pagoda: { x: MAIN_AXIS_X, z: -40, floor: 1.8 }, fountain: { x: -63, z: -56 },
  hall: { x: -62, z: -12 }, fitness: { x: -63, z: 64 },
  event:{x:-64,z:21},
  tower: { x: 62, z: 56 },
  vr: {x:-74,z:-23},folk:{x:-74,z:-3},vrPagoda:{x:-53,z:-23},
  cart: { x: -30.1, z: 35.8 }, mailbox: { x: 24.2, z: 30.4 },
  shop: { x: 27, z: 50.8 }, drink: { x: 31.8, z: 54.6 }, photo: { x: 30, z: 35.6 },
}
// Keep the wheel's anchor/model for later use, but omit it from the active map.
const kiosks={shop:{enabled:false,fenced:false,width:4,depth:2,height:4.3,yaw:-Math.PI/2},drink:{enabled:true,fenced:true,width:6.8,depth:4.59,height:5.185,scale:.85,yaw:Math.atan2(plaza.x-sites.drink.x,plaza.z-sites.drink.z)},photo:{enabled:true,fenced:false,width:9.6,depth:6.6,yaw:-Math.PI/3}}
const fishBreadShop={width:9.216,depth:6.912,height:5.856,scale:.96,yaw:Math.PI/3,roofWidth:10.176,roofDepth:8.064}
const cartPoint=(across:number,forward:number):MapPoint=>[
  sites.cart.x+across*Math.cos(fishBreadShop.yaw)+forward*Math.sin(fishBreadShop.yaw),
  sites.cart.z-across*Math.sin(fishBreadShop.yaw)+forward*Math.cos(fishBreadShop.yaw),
]

// Persistent IDs are explicit. Array order never assigns pavilion/table identities.
const pavilionPositions: Record<string, readonly [number, number]> = {
  P0: [MAIN_AXIS_X, 6], P1: [-28, 4], P2: [28, 4], P3: [-24, -20], P4: [24, -20],
  P5: [-24, -61], P6: [24, -61], P7: [-24, 74], P8: [24, 74],
}

const otherTablePositions: Record<string, readonly [number, number]> = {
  'table-1': [-12, 34], 'table-2': [12, 34], 'table-3': [-12, 58], 'table-4': [12, 58],
  'table-14': [-73, 48], 'table-15': [48, -70.5], 'table-16': [71, 75],
}

// Route control points are world coordinates; review adjoining routes after moving a district.
const routes:readonly MapRoute[] = [
  {id:'arrival', points:[[MAIN_AXIS_X,88],[MAIN_AXIS_X,20]],width:8},
  {id:'central-north',points:[[MAIN_AXIS_X,-8],[MAIN_AXIS_X,-27]],width:8},
  {id:'pagoda-west',points:[[-39,-40],[-13,-40]],width:6},
  {id:'pagoda-east',points:[[13,-40],[39,-40]],width:6},
  {id:'north-exit',points:[[MAIN_AXIS_X,-53],[MAIN_AXIS_X,-84]],width:6},
  {id:'west-pavilions',points:[[-24,-8],[-24,-76]],width:4},
  {id:'east-pavilions',points:[[24,-8],[24,-76]],width:4},
  {id:'west-main-side-pavilion',points:[[-28,-8],[-28,25]],width:4},
  {id:'east-main-side-pavilion',points:[[28,-8],[28,25]],width:4},
  {id:'west-south-pavilion',points:[[-24,62],[-24,86]],width:4},
  {id:'east-south-pavilion',points:[[24,62],[24,86]],width:4},
  {id:'north-cross',points:[[-39,-76],[84,-76]],width:4},
  {id:'upper-west-cross',points:[[-63,-36],[-39,-36]],width:4},
  {id:'upper-cross',points:[[-39,-36],[-39,-40],[39,-40]],width:4},
  {id:'stone-approach',points:[[39,-40],[39,-26],[84,-26]],width:4},
  {id:'west-spine',points:[[-39,-76],[-39,84]],width:4},
  {id:'middle-cross',points:[[-50,-8],[39,-8]],width:4},
  {id:'hall-south-cross',points:[[-84,12],[-39,12]],width:4},
  {id:'hall-entrance',points:[[-62,12],[-62,-23]],width:4},
  {id:'garden-cross',points:[[-39,25],[39,25]],width:6},
  {id:'pavilion-east-lane',points:[[14.9,-8],[14.9,25]],width:2.6},
  {id:'pavilion-west-lane',points:[[-14.9,-8],[-14.9,25]],width:2.6},
  {id:'wood-approach',points:[[39,27],[39,9],[84,9]],width:4},
  {id:'south-cross',points:[[-82,81],[-39,81]],width:3.5},
  {id:'fitness-north',points:[[-63,31],[-63,53]],width:3.5},
  {id:'fitness-cart-link',points:[[-63,31],[-51,31],[-51,23]],width:3.5},
  {id:'fitness-west',points:[[-84,64],[-78,64]],width:3.5},
  {id:'fitness-south',points:[[-63,75],[-63,84]],width:3.5},
  {id:'fitness-main',points:[[-48,64],[-39,64],[-39,46],[-20,46]],width:3.5},
  {id:'service-entry',points:[[-39,62],[39,62]],width:4},
  {id:'service-plaza',points:[[-39,46],[-20,46]],width:4},
  {id:'photo-plaza',points:[[20,46],[39,46]],width:4},
  {id:'fountain-south',points:[[-63,-42],[-63,-36]],width:4},
  {id:'fountain-vr',points:[[-63,-42],[-63,-32],[-62,-32]],width:3.5},
  {id:'vr-west-entry',points:[[-84,-12],[-62,-12]],width:3},
  {id:'fountain-east',points:[[-49,-56],[-39,-56],[-39,-76]],width:4},
  {id:'fountain-north-grove',points:[[-76,-84],[-70,-78],[-65,-73],[-63,-70]],width:3},
  {id:'fountain-west',points:[[-84,-56],[-77,-56]],width:3.5},
  {id:'event-winding',points:[[-63,12],[-63,17],[-73,22],[-73,25],[-65,31],[-63,31]],width:3.5},
  {id:'event-east',points:[[-63,31],[-39,31]],width:3.5},
  {id:'event-west',points:[[-84,22],[-73,22]],width:3},
  {id:'south-east',points:[[39,27],[39,81],[82,81]],width:4},
  {id:'tower-west',points:[[39,56],[50.5,56]],width:4},
  {id:'tower-east',points:[[73.5,56],[84,56]],width:4},
  {id:'tower-south',points:[[62,67.5],[62,81]],width:4},
  {id:'tower-north',points:[[62,38],[62,44.5]],width:3},
  {id:'tower-garden-link',points:[[39,38],[62,38]],width:3},
  {id:'tower-loop',points:Array.from({length:65},(_,i)=>[62+Math.cos(i*Math.PI/32)*11.5,56+Math.sin(i*Math.PI/32)*11.5] as const),width:2.4},
  {id:'lake-west',points:[[39,-76],[39,31]],width:3.5},
  {id:'swim-west',points:[[39,-14],[46,-14]],width:3.5},
  {id:'swim-east',points:[[78,-14],[84,-14]],width:3.5},
  {id:'fishing-west',points:[[39,-43],[49,-43]],width:3.5},
  {id:'fishing-east',points:[[79,-43],[84,-43]],width:3.5},
  {id:'lake-east',points:[[84,-77],[84,77]],width:3.5},
] as const

export const PARK_DEFINITION = {
  // Preview schema metadata; this is independent of the live service map version.
  metadata: { schemaVersion:2, mapId:'park', stage:'preview', unit:'metre', up:'Y', north:'-Z', yawUnit:'radian' },
  // Physical solids never include the preview's character/movement clearance.
  physics:{terrainStep:2,spawnClearance:.04,wallThickness:.6,wallHeight:2.4},
  mainAxis:{x:MAIN_AXIS_X,width:8},
  park: {size:180,backgroundSize:316,spawn:[MAIN_AXIS_X,82] as MapPoint,wallCornerRadius:6,movementInset:1.2,movementCornerRadius:4.8,perimeterInset:6,perimeterCornerRadius:7,perimeterWidth:3.5},
  // Main facility placements, metres in the X/Z ground plane.
  sites,
  // Includes the low-poly canopy and a clear place to stand in front of the sound box.
  planting:{mailboxTreeClearance:4.4,facilityCanopyClearance:1.85,woodlandSupplementSpacing:3.15},
  mailbox:{scale:1.9,yaw:Math.atan2(plaza.x-sites.mailbox.x,plaza.z-sites.mailbox.z)},
  rankingBoard:{scale:1.06,roofWidth:10.6,roofDepth:2.226},
  // Lamp IDs stay stable. Local offsets follow their district when its layout moves.
  lighting:{anchors:[
    [20.284442352070435,51.43519994715294],[-20.284442352070432,51.43519994715294],[-20.284442352070435,40.564800052847076],
    [14.849242404917494,31.1507575950825],[20.284442352070435,40.56480005284706],[-5,79.5],
    [5,79.5],[-27,-33.5],[-27,-50.5],
    [21,-33.5],[21,-50.5],[-30.214285714285715,-79],
    [-12.642857142857146,-79],[4.928571428571431,-79],[22.5,-79],
    [40.071428571428584,-79],[57.64285714285714,-79],[75.21428571428572,-79],
    [-36,-68],[-36,-52],[-36,-36],
    [-36,-20],[-42,-4],[-42,28],
    [-42,44],[-42,60],[-36,76],
    [-50.25,15],[-60.25,42],[29.25,59],
    [36,54],[42,72],[49.75,78],
    [71.25,78],[81.25,-68.44444444444444],[81.25,-51.333333333333336],
    [81.25,-34.22222222222222],[81.25,17.111111111111114],[81.25,34.222222222222214],
    [81.25,51.33333333333334],[81.25,68.44444444444443],[-73,78],
  ] as readonly MapPoint[],relocations:{
    'lamp-0':{anchor:'plaza',offset:[21,9]},
    'lamp-1':{anchor:'plaza',offset:[-12,19.3]},
    'lamp-2':{anchor:'plaza',offset:[-15,-17]},
    'lamp-3':{anchor:'plaza',offset:[15,-17]},
    'lamp-4':{anchor:'plaza',offset:[12,19.3]},
    'lamp-36':{anchor:'lake',offset:[19.25,-24.5]},
    'lamp-41':{anchor:'fitness',offset:[-6.4,14]},
  } as Record<string,{anchor:'plaza'|'lake'|'fitness';offset:MapPoint}>},
  pavilions:pavilionPositions,
  tables:otherTablePositions,
  routes,
  curvedRoutes:['event-winding','fountain-north-grove','photo-plaza'],
  routeTurnRadius:3.5,
  // Model sizes and district footprints. Rendering and collision derive from these values.
  fountain:{scale:1.22,jetHeightScale:1.65,basePlazaRadius:14.4,baseBasinRadius:5.2,baseFootRadius:5.4,movementBottom:-1.1,movementTop:2.5},
  vrCourt:{x:-63,z:-12,width:34,depth:40,yaw:Math.PI/2},
  vrEdgeTrees:[...[-27,-21,-15,-2,4].map(z=>({x:-43.4,z})),...[-27,-21,-3,3].map(z=>({x:-81.1,z})),...[-77,-71,-55,-49].flatMap(x=>[{x,z:-33.1},{x,z:9.1}])],
  event:{width:32,depth:26,benches:[{x:-75,z:14,side:-1},{x:-57,z:26,side:1}]},
  fitness:{width:30,depth:22,radius:15,rx:15,rz:11,stationRadius:7.5,exitOffset:2.8,fenceRx:16.2,fenceRz:12.2,fenceOpening:5.6},
  kiosks,
  fishBreadShop,
  gate:{opening:5.2,boundaryOpening:5.2,postX:2.6},
  pavilionCourt:{width:14.5,depth:17},
  pavilionEdgeTrees:['P1','P2'].flatMap(id=>{
    const [x,z]=pavilionPositions[id]!,side=x!<0?-1:1
    return [...Array.from({length:8},(_,i)=>[-side*9.5,-6+i*2.9]),[-5.5,13],[0,13],[5.5,13],[-5.5,-9],[5.5,-9]].map(([dx,dz],i)=>({id:`pavilion-tree-${id}-${i}`,x:x!+dx!,z:z!+dz!}))
  }),
  vrStoneSets:[{id:'layout-vr-stone-set-1',tableId:'table-17',x:-53,z:-8},{id:'layout-vr-stone-set-2',tableId:'table-18',x:-53,z:2}],
  vrStoneSeats:[[0,1.8],[0,-1.8],[-2,0],[2,0]] as readonly MapPoint[],
  forestBenches:[{id:'bench-forest-southwest',x:-73,z:80,yaw:0},{id:'bench-forest-northeast',x:52,z:-73,yaw:0},{id:'bench-forest-southeast',x:74,z:73,yaw:0}],
  plaza,
  plazaRestGardens:[] as {id:string;x:number;z:number;width:number;depth:number;side:number}[],
  plazaRestBenches:[] as {id:string;x:number;z:number;yaw:number}[],
  plazaBins:[] as {id:string;x:number;z:number}[],
  // Deliberate tree belt; resolve filters entrance paths, forecourts and buildings.
  plazaTrees:[...([[-1.6,-5.95],[1,-5.95],[3.6,-5.95],[-7.1,-1.3],[-7.1,1.3],[7.1,-1.3],[7.1,1.3]] as const).map(([across,forward],i)=>{
    const [x,z]=cartPoint(across,forward)
    return {id:'fish-shop-tree-'+i,x,z}
  }),...([[-3,-5.2],[-.4,-5.2],[2.2,-5.2],[8,-2],[8,.6]] as const).map(([across,forward],i)=>({
    id:'ranking-grove-tree-'+i,
    x:sites.photo.x+across*Math.cos(kiosks.photo.yaw)+forward*Math.sin(kiosks.photo.yaw),
    z:sites.photo.z-across*Math.sin(kiosks.photo.yaw)+forward*Math.cos(kiosks.photo.yaw),
  })),...(['shop','drink','photo'] as const).filter(kind=>kiosks[kind].enabled).flatMap(kind=>{
    const p=sites[kind],k=kiosks[kind],points:{id:string;x:number;z:number}[]=[]
    // Two-dimensional side/back planting pockets; the front is intentionally empty.
    for(let row=0;row<10;row++)for(let col=0;col<17;col++){
      const x=(col-8)*1.3,z=-k.depth/2-7.8+row*1.3
      if(Math.abs(x)<k.width/2+1.8&&z>-k.depth/2-1.8||z>k.depth/2-.8)continue
      points.push({id:`kiosk-tree-${kind}-${row}-${col}`,x:p.x+x*Math.cos(k.yaw)+z*Math.sin(k.yaw),z:p.z-x*Math.sin(k.yaw)+z*Math.cos(k.yaw)})
    }
    return points
  }),...Array.from({length:96},(_,i)=>{
    const a=i*Math.PI/48,r=26+(i%3)*2.9
    return {id:'plaza-belt-tree-'+i,x:Math.cos(a)*r,z:46+Math.sin(a)*r}
  })],
  pagoda:{terraceHalf:13,stairHalfWidth:3,railOffset:2.75,stairEnd:17.4,steps:10,tread:.4,riser:.18},
  // Lake children use offsets so moving the lake moves crossings and decks together.
  lake:{x:62,z:-14,rx:18,rz:43,surfaceY:.045,depth:2.8,swimmingThreshold:.95,
    crossings:[{id:'layout-stone-bridge',kind:'stone' as const,offsetZ:-12,shoreOverlap:.55,halfWidth:1.4},{id:'layout-wood-bridge',kind:'wood' as const,offsetZ:23,shoreOverlap:.65,halfWidth:1.8}],
    decks:[{id:'layout-fishing-deck',offsetX:-13,offsetZ:-29,w:8,d:6,wood:true},{id:'layout-fishing-east',offsetX:17,offsetZ:-29,w:6,d:6,wood:false}],
    landingOffsets:[{x0:-20,x1:-17,y0:.085,y1:.32},{x0:20,x1:22,y0:.32,y1:.085}],
    swimEntryOffsets:[-20,20],lotusOffsets:[[-7,-35],[9,9],[-4,33]] as readonly MapPoint[],reedOffsets:[[-12,-35],[13,28],[7,-37],[-14,19]] as readonly MapPoint[],
  },
  // Existing effective movement clearances, not camera or jump landing bounds.
  collision:{boxClearance:.3,fenceRadius:.46,lampRadius:.48,fishingRailRadius:.32,shoreRailRadius:.4,
    fitnessTreeRadius:.95,fitnessBenchInner:2.45,fitnessBenchOuter:3.65,fitnessBenchGapSin:.35},
}
export type ParkDefinition = typeof PARK_DEFINITION
