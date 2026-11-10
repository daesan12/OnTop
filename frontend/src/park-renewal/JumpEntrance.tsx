import {PropBuilder} from '../world/art/propGeometry'
import {PropModel} from '../world/art/PropModel'
import {PropSign} from '../world/art/CraftedProp'
import {site,heightAt} from './plan'
const jump=site('jump'),y=heightAt(jump.x,24)
export const jumpEntryArt=(()=>{const b=new PropBuilder();for(const side of[-1,1]){const x=jump.x+side*3.4;b.box('stone','#aca997',[x,y+.15,24],[1.05,.3,1.05]);b.box('stone','#d0c8b3',[x,y+1.5,24],[.65,2.7,.65]);b.box('stone','#aaa28c',[x,y+2.93,24],[1,.22,1]);b.box('gold','#b39a62',[x,y+2.35,24.36],[.32,.4,.03])}b.box('wood','#594d38',[jump.x,y+3.18,24],[7.4,.28,.65]);for(const z of[23.7,24.3])b.box('tile','#414c53',[jump.x,y+3.38,z],[7.9,.15,.85],[z<24?-.18:.18,0,0]);return b.finish()})()
const draw=(c:CanvasRenderingContext2D,w:number,h:number)=>{c.fillStyle='#e6d9b7';c.fillRect(0,0,w,h);c.fillStyle='#355143';c.textAlign='center';c.textBaseline='middle';c.font=`700 ${h*.62}px "Malgun Gothic",sans-serif`;c.fillText('돌탑 점프맵',w/2,h/2,w*.92)}
export function JumpEntrance(){return <><PropModel art={jumpEntryArt} name="jump-course-entry-gate"/><PropSign draw={draw} position={[jump.x,y+2.85,24.39]} width={3.1} height={.5}/></>}
