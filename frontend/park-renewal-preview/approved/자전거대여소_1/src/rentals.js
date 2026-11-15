import { THREE, Builder, assertOptions, assetHandle, anchor, lantern, pagoda } from './primitives.js';
import { softBox } from './details.js';
import { rentalRoof } from './rental-roof.js';
import { rentalBuilding } from './rental-building.js';
import { BAY_X, DOCK_Z, POST_X, FLOOR_Y, SIGN_Z, LANTERN_Z, CHARGE_PORT_Y } from './rental-layout.js';
import { chargingDock, chargingSignIcon } from './charging-docks.js';

/** Empty 3-bay shelter. Vehicles are separate assets; no inventory, rental or charging logic. */
export function createRentalStation(options={}) {
  const {kind='bicycle',scale=1,quality='balanced',signTexture,castShadow=true}=options;
  assertOptions({scale,quality});
  if(!['bicycle','scooter'].includes(kind)) throw new RangeError('kind must be bicycle or scooter');
  const b=new Builder(quality),leds=new Builder(quality);
  rentalBuilding(b);
  for(const x of [-POST_X,POST_X]) {
    lantern(b,x,1.64,LANTERN_Z,.48);

    b.beam('gold','#a47738',[x,1.91,LANTERN_Z],[x,1.88,LANTERN_Z],.025);
  }
  rentalRoof(b);
  // A wheel slot is left open between two adjacent docking cheeks.
  for(const x of BAY_X) {
    for(const side of [-1,1]) {
      softBox(b,'stone',side>0?'#99959a':'#aaa3a4',[x+side*0.2,0.36,DOCK_Z],[0.16,0.49,0.47],0.07);
      softBox(b,'metal','#b0a593',[x+side*0.2,0.53,DOCK_Z],[0.09,0.09,0.18],0.025);
    }
    softBox(b,'glow','#edc17b',[x+0.2,0.37,DOCK_Z+.246],[0.035,0.24,0.018],0.008);
    b.box('metal','#947f68',[x,0.144,DOCK_Z-.03],[0.22,0.018,0.58]);
    chargingDock(b,leds,x);
  }
  // Low power channel stays behind the docks; the three wheel slots remain open.
  softBox(b,'metal','#6a7464',[0,.165,DOCK_Z+.33],[2.85,.07,.065],.014);
  // The board is not a clickable UI; the optional text is an original canvas drawing.
  b.at([0,1.955,SIGN_Z],[0,Math.PI,0],()=>{
    softBox(b,'wood','#ad7c43',[0,0,0],[2.25,.40,.11],.12);
    softBox(b,'wood','#765033',[0,0,.065],[2.08,.305,.025],.10);
    if(!signTexture)chargingSignIcon(b);
  });
  for(const x of [-.72,.72])b.beam('wood','#946337',[x,1.92,SIGN_Z+.06],[x,2.02,DOCK_Z-.31],.065);
  const group=b.finish(`korean-${kind}-rental-station`,castShadow);group.scale.setScalar(scale);
  const indicators=leds.finish(`${kind}-rental-charging-indicators`,false);
  indicators.traverse(o=>{if(!o.isMesh)return;o.material.emissive.set('#47bd75');o.material.emissiveIntensity=.7;o.material.roughness=.65;o.receiveShadow=false;});
  group.add(indicators);
  if(signTexture) {
    const label=new THREE.Mesh(new THREE.PlaneGeometry(2.04,.293),new THREE.MeshStandardMaterial({map:signTexture,roughness:1}));
    label.name=`${kind}-rental-korean-label`;label.position.set(0,1.955,SIGN_Z-.083);label.rotation.y=Math.PI;group.add(label);
  }
  const anchors={};
  for(const [i,x] of BAY_X.entries()) {
    anchors[`bay${i+1}`]=anchor(group,`${kind}-parking-bay-${i+1}`,[x,FLOOR_Y,0]);
    anchors[`dock${i+1}`]=anchor(group,`${kind}-wheel-dock-${i+1}`,[x,FLOOR_Y,DOCK_Z]);
    anchors[`chargePort${i+1}`]=anchor(group,`${kind}-charge-port-${i+1}`,[x+.085,CHARGE_PORT_Y,DOCK_Z+.02]);
  }
  anchors.postLeft=anchor(group,`${kind}-left-post`,[-POST_X,FLOOR_Y,DOCK_Z]);
  anchors.postRight=anchor(group,`${kind}-right-post`,[POST_X,FLOOR_Y,DOCK_Z]);
  anchors.front=anchor(group,`${kind}-rental-front`,[0,.12,-1.35]);
  anchors.signFace=anchor(group,`${kind}-sign-face`,[0,1.955,SIGN_Z-.083]);
  anchors.lanternLeft=anchor(group,`${kind}-lantern-left`,[-POST_X,1.64,LANTERN_Z]);
  anchors.lanternRight=anchor(group,`${kind}-lantern-right`,[POST_X,1.64,LANTERN_Z]);
  group.userData={assetId:`park/${kind}-rental-station`,version:'1.8.0',kind,bayCount:3,chargingPorts:3,chargingVisualOnly:true,postPlaneZ:DOCK_Z,dockPlaneZ:DOCK_Z,parkingDirection:'+Z',signFacing:'-Z',vehiclesIncluded:false,visualOnly:true};
  return assetHandle(group,anchors);
}

export function createBicycleRentalStation(options={}) { return createRentalStation({...options,kind:'bicycle'}); }
export function createScooterRentalStation(options={}) { return createRentalStation({...options,kind:'scooter'}); }

export function createRentalBanner(options={}) {
  const {scale=1,quality='balanced',signTexture,castShadow=true}=options;assertOptions({scale,quality});const b=new Builder(quality);
  softBox(b,'stone','#b9b09c',[0,0.11,0],[0.47,0.22,0.47],0.05);
  b.cylinder('wood','#946437',[0,1.85,-0.055],0.065,0.095,3.5,[0,0,0],10);
  softBox(b,'wood','#a87540',[0,3.45,0],[1.1,0.15,0.2],0.05);
  b.ball('wood','#95633a',[0,3.67,-0.055],[0.14,0.1,0.12]);
  b.box('paint','#785061',[0,2.36,0.035],[0.79,1.94,0.035]);
  for(const y of [1.39,3.32]) b.cylinder('metal','#c39b5e',[0,y,0.04],0.045,0.045,0.91,[0,0,Math.PI/2],10);
  for(const x of [-.29,.29]) b.beam('metal','#c39b5e',[x,3.45,.04],[x,3.32,.04],.035);
  for(const side of [-1,1]) for(const y of [1.52,3.18]) {
    b.box('metal','#d3b47a',[side*0.33,y,0.067],[0.12,0.022,0.015]);
    b.box('metal','#d3b47a',[side*0.37,y+(y<2?0.05:-0.05),0.067],[0.022,0.12,0.015]);
  }
  if(!signTexture) pagoda(b,'#e4cfa4',[0,2.5,0.07],0.33);
  const group=b.finish('korean-mobility-rental-banner',castShadow);group.scale.setScalar(scale);
  if(signTexture) {const mesh=new THREE.Mesh(new THREE.PlaneGeometry(0.64,1.68),new THREE.MeshStandardMaterial({map:signTexture,transparent:true,roughness:1}));mesh.position.set(0,2.36,0.066);mesh.name='rental-banner-label';group.add(mesh);}
  group.userData={assetId:'park/mobility-rental-banner',version:'1.1.0',visualOnly:true};
  return assetHandle(group,{ground:anchor(group,'rental-banner-ground',[0,0,0])});
}
