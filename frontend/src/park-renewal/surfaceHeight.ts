import {horrorFloorAt} from './horrorPlan'
import {site,heightAt,walkHeightAt,STATION_SCALE,BALLOON_SCALE,STATION_STAIRS,onBridge} from './plan'
import {fountainPavingRadius} from '../layout-preview/fountainPaving'
import {fountainAccessHeight} from './fountainAccessSurface'
import {accessSurfaceHeight,bridgeWalkHeight} from './accessSurfaces'
export function parkWalkSurface(x:number,z:number,currentY=4.28){
 const inner=horrorFloorAt(x,z);if(inner!==null)return inner
 if(onBridge(x,z))return bridgeWalkHeight(x)
 const tower=site('tower'),tx=tower.x-x,tz=tower.z-z,r=Math.hypot(tx,tz),base=heightAt(tower.x,tower.z),turnRise=40/3
 if(r>=5&&r<=8&&!(z>tower.z&&currentY<base+1)){const a=(Math.atan2(tz,tx)+Math.PI*2)%(Math.PI*2),first=base+.12*40/18+a/(Math.PI*2)*turnRise;let nearest=Infinity;for(let turn=0;turn<3;turn++){const h=first+turn*turnRise;if(Math.abs(h-currentY)<Math.abs(nearest-currentY))nearest=h}if(Math.abs(nearest-currentY)<1.5)return nearest}
 const top=base+40+.12*40/18,angle=(Math.atan2(tz,tx)+Math.PI*2)%(Math.PI*2)
 if(r<=8&&(r<=5||angle<Math.PI*1.25)&&Math.abs(currentY-top)<.8)return top
 const balloon=site('balloon'),ground=heightAt(balloon.x,balloon.z),deck=ground+.65*STATION_SCALE
 const bx=balloon.x+2.35*1.6*STATION_SCALE
 if(Math.hypot(x-bx,z-balloon.z)<1.69*BALLOON_SCALE)return deck+.12+(.425-.37)*BALLOON_SCALE
 if(Math.hypot(x-balloon.x,z-balloon.z)<5.95*1.6*STATION_SCALE)return deck
 const stepZ=z-balloon.z;if(Math.abs(x-balloon.x)<STATION_STAIRS.width/2&&stepZ>=STATION_STAIRS.zTop&&stepZ<=STATION_STAIRS.zBottom)return ground+Math.ceil((STATION_STAIRS.zBottom-stepZ)/(STATION_STAIRS.zBottom-STATION_STAIRS.zTop)*STATION_STAIRS.steps)/STATION_STAIRS.steps*STATION_STAIRS.top
 const f=site('fountain')
 if(Math.hypot(x-f.x,z-f.z)<fountainPavingRadius)return heightAt(f.x,f.z)+fountainAccessHeight(x-f.x,z-f.z)
 return accessSurfaceHeight(x,z)??walkHeightAt(x,z,currentY)
}
