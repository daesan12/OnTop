import { softBox } from './details.js';
import { roofPoint } from './rental-roof.js';
import { DOCK_Z, POST_X, LANTERN_Z } from './rental-layout.js';

/** Low three-bay canopy; both posts stand on the wheel-docking line. */
export function rentalBuilding(b) {
  softBox(b,'stone','#a39e93',[0,.045,.15],[3.12,.09,2.50],.035);
  for(let x=0;x<5;x++)for(let z=0;z<3;z++)b.box('stone',['#c8bca6','#d0c4ac','#beb39f'][(x+z)%3],[(x-2)*.60,.105,(z-1)*.80+.15],[.588,.03,.788]);
  for(const z of [-1.04,1.34])for(let i=0;i<6;i++)b.box('stone',i%2?'#b1a795':'#bdb29e',[(i-2.5)*.51,.065,z],[.502,.08,.12]);
  for(const x of [-POST_X,POST_X]) {
    softBox(b,'stone','#b9af9c',[x,.19,DOCK_Z],[.22,.14,.26],.025);
    b.cylinder('wood','#916039',[x,1.035,DOCK_Z],.065,.075,1.65,[0,0,0],12);
    softBox(b,'wood','#af7c47',[x,1.81,DOCK_Z],[.23,.10,.26],.015);
    b.box('wood','#576c5c',[x,1.865,DOCK_Z],[.24,.025,.28]);
    softBox(b,'wood','#a67644',[x,1.95,DOCK_Z],[.22,.15,.88],.012);
    b.beam('wood','#a57543',[x,1.53,DOCK_Z],[Math.sign(x)*(POST_X-.33),1.79,DOCK_Z],.07);
    b.beam('wood','#936139',[x,1.89,DOCK_Z],[x,1.89,LANTERN_Z],.06);
  }
  softBox(b,'wood','#875b34',[0,1.785,DOCK_Z],[2.94,.13,.16],.018);
  b.box('wood','#b98c54',[0,1.845,DOCK_Z+.09],[2.84,.018,.025]);
  for(const offset of [-.30,.30]) {
    const y=roofPoint(0,Math.abs(offset)/.61)[1]-.11;
    b.box('wood','#9c6b3e',[0,y,DOCK_Z+offset],[2.96,.10,.10]);
  }
}
