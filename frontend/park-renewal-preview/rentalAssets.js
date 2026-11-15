import {createBicycleRentalStation,createRentalSignTexture} from './approved/자전거대여소_1/asset.js'
import {createScooterRentalStation} from './approved/킥보드대여소_1/asset.js'
import {createBicycle} from './approved/자전거_1/asset.js'
import {createScooter} from './approved/킥보드_1/asset.js'
import {groundObject} from './assetSizing.ts'
import {Mesh,BoxGeometry,CylinderGeometry,MeshLambertMaterial,Vector3} from 'three'

export function electricBicycle(options){const result=createBicycle(options),battery=new Mesh(new BoxGeometry(.13,.32,.15),new MeshLambertMaterial({color:'#343e38'}));battery.position.set(0,.66,-.27);battery.rotation.x=-.24;result.group.add(battery);const hub=new Mesh(new CylinderGeometry(.105,.105,.15,12),new MeshLambertMaterial({color:'#687469'}));hub.rotation.z=Math.PI/2;hub.position.set(0,.35,-.64);result.group.add(hub);const display=new Mesh(new BoxGeometry(.1,.025,.065),new MeshLambertMaterial({color:'#476d5b'}));display.position.set(0,1.15,.45);result.group.add(display);return result}

export function rentalBay({kind='bicycle',...options}={}){
 const station=groundObject((kind==='bicycle'?createBicycleRentalStation:createScooterRentalStation)(options).group)
 station.updateMatrixWorld(true)
 for(let i=1;i<=3;i++){
  const dock=station.getObjectByName(kind+'-wheel-dock-'+i),bay=station.getObjectByName(kind+'-parking-bay-'+i),vehicle=groundObject((kind==='bicycle'?electricBicycle:createScooter)({quality:'light'}).group)
  const dockPoint=dock.position,bayY=bay.position.y,front=vehicle.getObjectByName(kind==='bicycle'?'bicycle-front-wheel':'scooter-front-wheel')
  vehicle.updateMatrixWorld(true);const wheel=front.getWorldPosition(new Vector3());vehicle.position.x+=dockPoint.x-wheel.x;vehicle.position.z+=dockPoint.z-wheel.z;vehicle.position.y+=bayY+.006;vehicle.name=kind+'-parked-vehicle-'+i;station.add(vehicle)
 }
 station.userData.parkingContact='native-floor-and-front-wheel-anchors';return station
}
export function rentalLabel(kind){return createRentalSignTexture(kind)}
