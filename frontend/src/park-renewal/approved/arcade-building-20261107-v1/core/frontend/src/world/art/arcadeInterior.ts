import {type PropBuilder} from '../../../../../../../../world/art/propGeometry.ts'

type Envelope={width:number;depth:number;height:number;doorWidth:number}
const walnut='#1d1736',gold='#6df3ff',wood='#302e55',cream='#d8fbff',mint='#e674f3'

/** Interior-only skins: exterior plaster stays intact and the cutaway stays open. */
export function addArcadeWallLining(b:PropBuilder,f:Envelope,cutaway=false){
 const {width:w,depth:d,height:h,doorWidth:door}=f
 b.box('paint','#25213d',[0,h/2,-d/2+.19],[w-.4,h-.3,.04])
 for(const side of [-1,1]){
  const sideH=cutaway&&side<0?1.3:h,frontH=cutaway?1.3:h,span=(w-door)/2
  b.box('paint','#242840',[side*(w/2-.19),sideH/2,0],[.04,sideH-.1,d-.4])
  b.box('paint','#25213d',[side*(door/2+span/2),frontH/2,d/2-.19],[span-.05,frontH-.1,.04])
 }
}

/** All dressing hugs an existing wall or lies flush with the floor; future machine bays stay empty. */
export function addArcadeInterior(b:PropBuilder,f:Envelope){
 const {width:w,depth:d}=f
 b.box('paint','#11162b',[0,.142,0],[w-.35,.008,d-.35])
 for(let ix=0;ix<w;ix++)for(let iz=0;iz<d;iz++){
  const x=-w/2+ix+.5,z=-d/2+iz+.5
  const active=z<-.8&&x<.5,corridor=Math.abs(x)<1.5
  const color=active?((ix+iz)%2?'#252045':'#342855'):corridor?'#161e34':((ix+iz)%2?'#1c243d':'#242d49')
  b.box('paint',color,[x,.146,z],[.98,.012,.98])
 }
 // Dark inset panels and cyan trim guide the entrance without raised rails.
 for(const side of [-1,1]){
  b.box('wood',wood,[side*(w/2-.27),.15,0],[.35,.018,d-.45])
  b.box('paint',gold,[side*1.55,.156,1.7],[.065,.012,d-3.6])
  const x=side*(w/2-.22)
  b.box('paint',walnut,[x,.72,0],[.12,1.16,d-.35])
  b.box('wood',wood,[x,1.33,0],[.14,.12,d-.3])
  for(let z=-d/2+.6;z<d/2;z+=.65)b.box('wood','#524475',[x,.73,z],[.15,1.1,.065])
 }
 for(const z of [-d/2+.27,d/2-.27])b.box('wood',wood,[0,.15,z],[w-.5,.018,.35])
 const back=-d/2+.22
 b.box('paint',walnut,[0,.72,back],[w-.35,1.16,.12])
 b.box('wood',wood,[0,1.33,back],[w-.3,.12,.14])
 for(let x=-w/2+.55;x<w/2;x+=.65)b.box('wood','#524475',[x,.73,back],[.065,1.1,.15])
 b.box('wood',wood,[0,4.7,back+.02],[12.6,1.45,.16])
 b.box('wood',wood,[w/2-.23,3.65,.1],[.16,2.5,8.3])
 // Neon in ArcadeNeon supplies the wall lighting; avoid warm light strips here.
 // Cyan and magenta details connect the walls to the floor grid.
 for(let i=0;i<30;i++){
  const x=-w/2+.65+i*(w-1.3)/29
  b.box('paint',i%3?mint:gold,[x,1.67+(i%4===0?.22:0),back+.1],[.23,.2,.05])
 }
}

export function drawArcadeInteriorBanner(c:CanvasRenderingContext2D,w:number,h:number){
 c.fillStyle='#10162d';c.fillRect(0,0,w,h);c.strokeStyle=mint;c.lineWidth=5;c.strokeRect(4,4,w-8,h-8)
 c.fillStyle=gold;c.textAlign='center';c.textBaseline='middle';c.shadowColor=gold;c.shadowBlur=h*.045
 c.font=`900 ${h*.49}px sans-serif`;c.fillText('ARCADE ZONE',w/2,h*.36,w*.85)
 c.shadowBlur=0;c.fillStyle='#ddbbff';c.font=`700 ${h*.16}px sans-serif`;c.fillText('HIGH SCORE  ·  GAME ON',w/2,h*.8,w*.83)
}

/** A controller motif replaces the park's trees and central seal. */
function gamepad(c:CanvasRenderingContext2D,x:number,y:number,size:number){
 c.save();c.translate(x,y);c.scale(size,size);c.lineWidth=.035;c.strokeStyle=gold;c.fillStyle='#141d36'
 c.beginPath();c.moveTo(-.55,-.33);c.lineTo(.55,-.33);c.quadraticCurveTo(.67,-.33,.7,-.15);c.lineTo(.8,.32);c.quadraticCurveTo(.83,.58,.59,.48);c.lineTo(.35,.24);c.lineTo(-.35,.24);c.lineTo(-.59,.48);c.quadraticCurveTo(-.83,.58,-.8,.32);c.lineTo(-.7,-.15);c.quadraticCurveTo(-.67,-.33,-.55,-.33);c.closePath();c.fill();c.stroke()
 c.fillStyle=gold;c.fillRect(-.52,-.07,.34,.1);c.fillRect(-.4,-.19,.1,.34)
 for(const [dx,dy,color]of [[.4,-.19,mint],[.55,-.04,'#b99aff'],[.25,-.04,'#b99aff'],[.4,.11,mint]] as const){c.fillStyle=color;c.beginPath();c.arc(dx,dy,.065,0,Math.PI*2);c.fill()}
 c.fillStyle='#889dce';c.fillRect(-.11,.08,.08,.035);c.fillRect(.03,.08,.08,.035);c.restore()
}

export function drawArcadeInteriorMural(c:CanvasRenderingContext2D,w:number,h:number){
 c.fillStyle='#10162d';c.fillRect(0,0,w,h);c.strokeStyle=gold;c.lineWidth=6;c.strokeRect(5,5,w-10,h-10)
 gamepad(c,w*.18,h*.52,h*.5);gamepad(c,w*.82,h*.52,h*.5)
 c.textAlign='center';c.textBaseline='middle';c.fillStyle=mint;c.shadowColor=mint;c.shadowBlur=h*.035
 c.font=`900 ${h*.3}px sans-serif`;c.fillText('LEVEL UP!',w/2,h*.37,w*.43)
 c.shadowBlur=0;c.fillStyle=cream;c.font=`700 ${h*.14}px monospace`;c.fillText('PLAY  ·  SCORE  ·  REPEAT',w/2,h*.75,w*.45)
}

export function drawArcadeFloorBadge(c:CanvasRenderingContext2D,w:number,h:number){
 c.fillStyle='#10162d';c.fillRect(0,0,w,h);c.strokeStyle=gold;c.lineWidth=w*.012;c.strokeRect(w*.035,h*.035,w*.93,h*.93)
 c.strokeStyle=mint;c.lineWidth=w*.005;c.strokeRect(w*.07,h*.07,w*.86,h*.86)
 c.fillStyle='#b99aff';c.textAlign='center';c.textBaseline='middle';c.font=`800 ${h*.095}px monospace`;c.fillText('READY PLAYER',w/2,h*.19,w*.75)
 gamepad(c,w/2,h*.48,w*.46)
 c.shadowColor=gold;c.shadowBlur=w*.025;c.fillStyle=gold;c.font=`900 ${h*.16}px sans-serif`;c.fillText('PLAY',w/2,h*.82,w*.65);c.shadowBlur=0
}
