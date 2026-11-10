/** Cosmetic sphere contacts for the capsule machine. This never chooses a prize or moves an avatar. */
export interface PileBall {
 x:number;y:number;z:number;vx:number;vy:number;vz:number;rx:number;ry:number;rz:number
}
const R=18, FLOOR=-7, RX=86, RZ=44, STEP=1/120
export const VISUAL_CAPSULE_COUNT=30
export class CapsulePile {
 balls:PileBall[]
 contacts=0
 kicks=0
 private remainder=0
 private motorTime=0
 private nextKick=.04
 constructor(count=VISUAL_CAPSULE_COUNT){
  // Decorative fill count is independent of server prize stock and probabilities.
  const positions:number[][]=[]
  for(let layer=0;positions.length<count;layer++)for(const z of [-22,16])for(const x of [-54,-18,18,54]){
   if(positions.length<count)positions.push([x+(layer%2?8:0),FLOOR+layer*31,z+(layer%2?3:0)])
  }
  this.balls=positions.map(([x,y,z],i)=>({x:x!,y:y!,z:z!,vx:0,vy:0,vz:0,rx:(i%3-1)*.3,ry:i*.72,rz:(i%2?1:-1)*.22}))
  this.settle()
 }
 advance(elapsed:number,power:number){
  this.remainder+=Math.min(.15,Math.max(0,elapsed))
  while(this.remainder+1e-9>=STEP){this.step(STEP,power);this.remainder-=STEP}
 }
 settle(){
  for(let n=0;n<180;n++)this.step(STEP,0)
  for(const b of this.balls)b.vx=b.vy=b.vz=0
  this.remainder=0
 }
 private boundary(b:PileBall){
  if(b.y<FLOOR){
   b.y=FLOOR
   b.vy=b.vy<-28?-b.vy*.22:0
   b.vx*=.985;b.vz*=.985
  }
  if(b.y>78){b.y=78;b.vy=Math.min(0,b.vy)}
  const q=Math.hypot(b.x/RX,b.z/RZ)
  if(q>1){
   b.x/=q;b.z/=q
   const nx=b.x/(RX*RX),nz=b.z/(RZ*RZ),length=Math.hypot(nx,nz)
   const nX=nx/length,nZ=nz/length,v=b.vx*nX+b.vz*nZ
   if(v>0){b.vx-=1.35*v*nX;b.vz-=1.35*v*nZ}
  }
 }
 private step(dt:number,power:number){
  if(power>0){
   this.motorTime+=dt
   if(this.motorTime>=this.nextKick){
    const a=this.kicks*2.4,px=Math.cos(a)*48,pz=Math.sin(a)*23
    let picked:PileBall|undefined,best=Infinity
    for(const b of this.balls){
     const score=Math.hypot(b.x-px,b.z-pz)+Math.max(0,b.y-FLOOR)*2
     if(score<best){picked=b;best=score}
    }
    if(picked){
     picked.vx+=-Math.sin(a)*150*power;picked.vz+=Math.cos(a)*110*power
     picked.vy=Math.max(picked.vy,(70+(this.kicks%2)*12)*power)
    }
    this.kicks++;this.nextKick=this.motorTime+.22
   }
  }
  const old=this.balls.map(b=>({x:b.x,z:b.z}))
  for(const b of this.balls){
   if(power>0&&b.y<42){
    const r=Math.max(18,Math.hypot(b.x,b.z))
    // A bottom impeller pushes loose balls; gravity and contacts carry the pile.
    b.vx+=-b.z/r*420*power*dt;b.vz+=b.x/r*360*power*dt
   }
   b.vy-=240*dt
   const drag=Math.exp(-dt*(power>0?.3:2.2))
   b.vx*=drag;b.vz*=drag
   const speed=Math.hypot(b.vx,b.vy,b.vz)
   if(speed>220){const scale=220/speed;b.vx*=scale;b.vy*=scale;b.vz*=scale}
   b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt
   this.boundary(b)
  }
  for(let pass=0;pass<4;pass++){
   for(let i=0;i<this.balls.length;i++)for(let j=i+1;j<this.balls.length;j++){
    const a=this.balls[i]!,b=this.balls[j]!,dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z
    const distance=Math.max(.001,Math.hypot(dx,dy,dz))
    if(distance>=2*R)continue
    const nx=dx/distance,ny=dy/distance,nz=dz/distance,correction=Math.max(0,2*R-distance-.02)*.5
    a.x-=nx*correction;a.y-=ny*correction;a.z-=nz*correction
    b.x+=nx*correction;b.y+=ny*correction;b.z+=nz*correction
    const closing=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny+(b.vz-a.vz)*nz
    if(closing<0){
     const impulse=-closing*.6
     a.vx-=nx*impulse;a.vy-=ny*impulse;a.vz-=nz*impulse
     b.vx+=nx*impulse;b.vy+=ny*impulse;b.vz+=nz*impulse
     this.contacts++
    }
   }
   for(const b of this.balls)this.boundary(b)
  }
  this.balls.forEach((b,i)=>{
   b.rx+=(b.z-old[i]!.z)/R
   b.rz-=(b.x-old[i]!.x)/R
  })
 }
}
