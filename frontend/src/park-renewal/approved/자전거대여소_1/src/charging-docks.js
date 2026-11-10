import { THREE } from './primitives.js';
import { softBox } from './details.js';
import { DOCK_Z, CHARGE_PORT_Y } from './rental-layout.js';

/** Static charging detail only: no power, battery state, interaction or vehicle logic. */
export function chargingDock(b,leds,x) {
  const y=CHARGE_PORT_Y;
  // Controller, dark status panel and metallic contact shoe are part of the empty dock.
  softBox(b,'metal','#7b776b',[x+.2,.64,DOCK_Z],[.155,.12,.21],.025);
  softBox(b,'metal','#303e39',[x+.2,.40,DOCK_Z-.246],[.125,.265,.030],.008);
  softBox(b,'metal','#555f52',[x+.135,y,DOCK_Z+.02],[.055,.068,.065],.013);
  b.cylinder('gold','#c3a76b',[x+.105,y,DOCK_Z+.02],.019,.019,.04,[0,0,Math.PI/2],10);
  // Cable is retained to the outer cheek, outside the wheel slot and adjacent bay.
  b.curve('wood','#3f4942',[[x+.20,.65,DOCK_Z-.10],[x+.31,.57,DOCK_Z-.15],[x+.33,.34,DOCK_Z-.14],[x+.30,.26,DOCK_Z-.06],[x+.28,y,DOCK_Z+.02]],.009,12,5);
  b.box('metal','#8d927d',[x+.31,.34,DOCK_Z-.14],[.034,.043,.031]);
  b.beam('metal','#626d5c',[x+.28,y,DOCK_Z+.02],[x+.15,y,DOCK_Z+.02],.025);
  // Battery outline and three illuminated bars face the loading/sign side (-Z).
  const cx=x+.2,cy=.40,z=DOCK_Z-.267;
  for(const side of [-1,1])leds.box('glow','#a7e9bd',[cx+side*.043,cy,z],[.007,.138,.008]);
  for(const side of [-1,1])leds.box('glow','#a7e9bd',[cx,cy+side*.069,z],[.093,.007,.008]);
  leds.box('glow','#a7e9bd',[cx,cy+.082,z],[.028,.019,.008]);
  for(let i=0;i<3;i++)leds.box('glow','#91e7ad',[cx,cy-.044+i*.044,z],[.063,.025,.008]);
  leds.box('glow','#7ce7a0',[cx,.665,DOCK_Z-.109],[.085,.012,.007]);
  // A small raised lightning mark on the controller makes the electrical purpose clear.
  const s=new THREE.Shape();s.moveTo(-.01,.035);s.lineTo(.018,.035);s.lineTo(.002,.007);s.lineTo(.023,.007);s.lineTo(-.019,-.039);s.lineTo(-.008,-.008);s.lineTo(-.026,-.008);s.closePath();
  leds.add('glow',new THREE.ExtrudeGeometry(s,{depth:.007,bevelEnabled:false}),'#a7e9bd',[cx,.625,DOCK_Z-.109],[1,1,1],[0,Math.PI,0]);
}

/** Identical charging symbol on both untextured signboards. */
export function chargingSignIcon(b) {
  const color='#c4e1b8';
  for(const side of [-1,1])b.box('metal',color,[side*.16,0,.084],[.018,.19,.012]);
  for(const side of [-1,1])b.box('metal',color,[0,side*.095,.084],[.338,.018,.012]);
  b.box('metal',color,[.188,0,.084],[.04,.07,.012]);
  const s=new THREE.Shape();s.moveTo(-.015,.075);s.lineTo(.035,.075);s.lineTo(.005,.015);s.lineTo(.055,.015);s.lineTo(-.035,-.075);s.lineTo(-.015,-.01);s.lineTo(-.06,-.01);s.closePath();
  b.add('metal',new THREE.ExtrudeGeometry(s,{depth:.012,bevelEnabled:false}),color,[0,0,.084]);
}
