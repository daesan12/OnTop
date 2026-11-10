import {horrorFloorAt} from './horrorPlan'
import {site,heightAt,walkHeightAt,REST_PAVILIONS,SUB_PAVILION_SCALE,LAKE,STATION_SCALE,BALLOON_SCALE,STATION_STAIRS} from './plan'
import {fountainPavingRadius} from '../layout-preview/fountainPaving'
import {fountainAccessHeight} from './fountainAccessSurface'
export function parkWalkSurface(x:number,z:number,currentY=4.28){
 const inner=horrorFloorAt(x,z);if(inner!==null)return inner
 const tower=site('tower'),tx=tower.x-x,tz=tower.z-z,r=Math.hypot(tx,tz),base=heightAt(tower.x,tower.z),turnRise=40/3
 if(r>=5&&r<=8&&!(z>tower.z&&currentY<base+1)){const a=(Math.atan2(tz,tx)+Math.PI*2)%(Math.PI*2),first=base+.12*40/18+a/(Math.PI*2)*turnRise;let nearest=Infinity;for(let turn=0;turn<3;turn++){const h=first+turn*turnRise;if(Math.abs(h-currentY)<Math.abs(nearest-currentY))nearest=h}if(Math.abs(nearest-currentY)<1.5)return nearest}
 const top=base+40+.12*40/18,angle=(Math.atan2(tz,tx)+Math.PI*2)%(Math.PI*2)
 if(r<=8&&(r<=5||angle<Math.PI*1.25)&&Math.abs(currentY-top)<.8)return top
 const balloon=site('balloon'),ground=heightAt(balloon.x,balloon.z),deck=ground+.65*STATION_SCALE
 const bx=balloon.x+2.35*1.6*STATION_SCALE
 if(Math.hypot(x-bx,z-balloon.z)<1.69*BALLOON_SCALE)return deck+.12+(.425-.37)*BALLOON_SCALE
 if(Math.hypot(x-balloon.x,z-balloon.z)<5.95*1.6*STATION_SCALE)return deck
 const stepZ=z-balloon.z;if(Math.abs(x-balloon.x)<STATION_STAIRS.width/2&&stepZ>=STATION_STAIRS.zTop&&stepZ<=STATION_STAIRS.zBottom)return ground+Math.ceil((STATION_STAIRS.zBottom-stepZ)/(STATION_STAIRS.zBottom-STATION_STAIRS.zTop)*STATION_STAIRS.steps)/STATION_STAIRS.steps*STATION_STAIRS.top
 const f=site('fountain'),p=site('pagoda'),main=site('pavilion')
 if(Math.hypot(x-f.x,z-f.z)<fountainPavingRadius)return heightAt(f.x,f.z)+fountainAccessHeight(x-f.x,z-f.z)
 const dx=Math.abs(x-p.x),dz=Math.abs(z-p.z)
 if(dx<13&&dz<13)return heightAt(p.x,p.z)+1.8
 for(const[along,across]of[[dx,dz],[dz,dx]])if(across!<3&&along!>=13&&along!<17.01)return heightAt(p.x,p.z)+Math.ceil((17-along!)/.4)*.18
 if(Math.hypot(x-main.x,z-main.z)<9.4)return heightAt(main.x,main.z)+2.6
 if(Math.abs(x-main.x)<2.4&&z-main.z>=9.4&&z-main.z<13.6)return heightAt(main.x,main.z)+2.6*(13.6-z+main.z)/4.2
 for(const[sx,sz,yaw]of [...REST_PAVILIONS.map(([x,z],i)=>[x,z,site('rest-'+(i+1)).yaw!]as const),[LAKE.x,LAKE.z,-Math.PI/2]as const]){const dx=x-sx,dz=z-sz,c=Math.cos(yaw),s=Math.sin(yaw),lx=c*dx-s*dz,lz=s*dx+c*dz,base=heightAt(sx,sz),unit=1.1*SUB_PAVILION_SCALE,floor=.572*unit;if(Math.hypot(lx,lz)<2.9*unit)return base+floor;if(Math.abs(lx)<.76*unit&&lz>=2.9*unit&&lz<3.77*unit)return base+.085+(floor-.085)*(3.77*unit-lz)/(.87*unit)}
 return walkHeightAt(x,z,currentY)
}
