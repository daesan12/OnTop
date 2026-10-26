/** Shared authoring source for the service map, preview and generated Java resources. */
export type MapPoint = readonly [number,number]
export type MapRoute = {id:string;points:readonly MapPoint[];width:number}
const sites = {
  pagoda: { x: 0, z: -40, floor: 1.8 }, fountain: { x: -63, z: -56 },
  hall: { x: -62, z: -12 }, fitness: { x: -63, z: 64 },
  event:{x:-64,z:21},
  tower: { x: 62, z: 56 },
  vr: {x:-74,z:-23},folk:{x:-74,z:-3},vrPagoda:{x:-53,z:-23},
  cart: { x: -51, z: 23 }, mailbox: { x: -18, z: 18 },
  shop: { x: -29, z: 35 }, drink: { x: -26, z: 50.5 }, photo: { x: 29, z: 35 },
  balloon: { x: -35, z: 29 },
}

// Persistent IDs are explicit. Array order never assigns pavilion/table identities.
const pavilionPositions: Record<string, readonly [number, number]> = {
  P0: [0, 6], P1: [-24, 4], P2: [24, 4], P3: [-24, -20], P4: [24, -20],
  P5: [-24, -61], P6: [24, -61], P7: [-24, 74], P8: [24, 74],
}

const otherTablePositions: Record<string, readonly [number, number]> = {
  'table-1': [-10, 32], 'table-2': [10, 32], 'table-3': [-10, 52], 'table-4': [10, 52],
  'table-14': [-73, 48], 'table-15': [48, -72], 'table-16': [71, 75],
}

// Route control points are world coordinates; review adjoining routes after moving a district.
const routes:readonly MapRoute[] = [
  {id:'arrival', points:[[0,88],[0,20]],width:8},
  {id:'central-north',points:[[0,-8],[0,-27]],width:6},
  {id:'pagoda-west',points:[[-39,-40],[-13,-40]],width:6},
  {id:'pagoda-east',points:[[13,-40],[39,-40]],width:6},
  {id:'north-exit',points:[[0,-53],[0,-84]],width:6},
  {id:'west-pavilions',points:[[-24,27],[-24,-76]],width:4},
  {id:'east-pavilions',points:[[24,27],[24,-76]],width:4},
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
  {id:'fitness-cart-link',points:[[-63,47],[-56,43],[-51,37],[-51,25.5]],width:3.5},
  {id:'fitness-west',points:[[-84,64],[-78,64]],width:3.5},
  {id:'fitness-south',points:[[-63,75],[-63,84]],width:3.5},
  {id:'fitness-main',points:[[-48,64],[-39,64],[-39,56],[-12,56]],width:3.5},
  {id:'service-entry',points:[[-39,62],[39,62]],width:4},
  {id:'service-plaza',points:[[-39,43],[-12,43]],width:3},
  {id:'photo-plaza',points:[[14,43],[22,43],[26,40]],width:3},
  {id:'photo-front',points:[[26,40],[26,62]],width:3.5},
  {id:'photo-north',points:[[29,25],[29,28]],width:3.5},
  {id:'fountain-south',points:[[-63,-42],[-63,-36]],width:4},
  {id:'fountain-vr',points:[[-63,-42],[-63,-32],[-62,-32]],width:3.5},
  {id:'vr-west-entry',points:[[-84,-12],[-62,-12]],width:3},
  {id:'fountain-east',points:[[-49,-56],[-39,-56],[-39,-76]],width:4},
  {id:'fountain-north-grove',points:[[-76,-84],[-70,-78],[-65,-73],[-63,-70]],width:3},
  {id:'fountain-west',points:[[-84,-56],[-77,-56]],width:3.5},
  {id:'event-winding',points:[[-63,12],[-63,15],[-70,18],[-73,22],[-68,26],[-60,30],[-49,31],[-39,31]],width:3},
  {id:'event-west',points:[[-84,22],[-73,22]],width:3},
  {id:'cart-access',points:[[-51,31],[-51,25.5]],width:2.8},
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
  // The service and preview use the same generated identity.
  metadata: { schemaVersion:2, mapId:'park', stage:'service', unit:'metre', up:'Y', north:'-Z', yawUnit:'radian' },
  // Physical solids never include the preview's character/movement clearance.
  physics:{terrainStep:2,spawnClearance:.04,wallThickness:.6,wallHeight:2.4},
  park: {size:180,backgroundSize:316,spawn:[0,82] as MapPoint,wallCornerRadius:6,movementInset:1.2,movementCornerRadius:4.8,perimeterInset:6,perimeterCornerRadius:7,perimeterWidth:3.5},
  // Main facility placements, metres in the X/Z ground plane.
  sites,
  pavilions:pavilionPositions,
  tables:otherTablePositions,
  routes,
  curvedRoutes:['event-winding','fountain-north-grove','fitness-cart-link','photo-plaza'],
  routeTurnRadius:3.5,
  // Model sizes and district footprints. Rendering and collision derive from these values.
  fountain:{scale:1.22,jetHeightScale:1.65,basePlazaRadius:14.4,baseBasinRadius:5.2},
  vrCourt:{x:-63,z:-12,width:34,depth:40,yaw:Math.PI/2},
  vrEdgeTrees:[...[-27,-21,-15,-2,4].map(z=>({x:-43.4,z})),...[-27,-21,-3,3].map(z=>({x:-81.1,z})),...[-77,-71,-55,-49].flatMap(x=>[{x,z:-33.1},{x,z:9.1}])],
  event:{width:32,depth:26,benches:[{x:-75,z:14,side:-1},{x:-57,z:26,side:1}]},
  fitness:{width:30,depth:22,radius:15,rx:15,rz:11,stationRx:11.5,stationRz:7.5,fenceRx:16.2,fenceRz:12.2,fenceOpening:5.6},
  kiosks:{shop:{width:9.6,depth:7.2,yaw:Math.PI/4},drink:{width:7.8,depth:5,yaw:0},photo:{width:8.8,depth:6.6,yaw:-Math.PI/4}},
  gate:{opening:5.2,boundaryOpening:5.2,postX:2.6},
  pavilionCourt:{width:14.5,depth:17},
  vrStoneSets:[{id:'layout-vr-stone-set-1',x:-53,z:-8},{id:'layout-vr-stone-set-2',x:-53,z:2}],
  plaza:{x:0,z:42,radius:7.4,width:70,depth:34},
  plazaRestGardens:[-1,1].map(side=>({id:'plaza-rest-garden-'+side,x:side*19.3,z:34.5,width:4.6,depth:6.8,side})),
  plazaRestBenches:[-1,1].flatMap(side=>[33,36].map(z=>({id:'plaza-rest-bench-'+side+'-'+z,x:side*16.3,z,yaw:-side*Math.PI/2}))),
  plazaBins:[-1,1].map(side=>({id:'plaza-bin-'+side,x:side*16.5,z:39})),
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
