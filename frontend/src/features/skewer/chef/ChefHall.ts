import * as THREE from 'three'
import { RestaurantSet } from '../serviceHall/rendering/RestaurantSet'
import { ToyPeople, type ToyActor } from '../serviceHall/rendering/ToyPeople'
import { SculptedServer } from '../serviceHall/rendering/SculptedServer'
import { createHallFloor, FLOOR_DEPTH_SCALE } from '../serviceHall/rendering/HallFloor'
import { TABLES, ROOM, route } from '../serviceHall/plan'
import type { HallSight } from './model'
import { ChefCourtyard } from './ChefCourtyard'
import { GuestJourney } from '../serviceHall/rendering/GuestJourney'

/** Visual-only hall. Deliberately accepts no bills, recipes or customer bubbles. */
export class ChefHall {
  readonly root = new THREE.Group()
  private art = new RestaurantSet()
  private floor = createHallFloor(this.art)
  private courtyard = new ChefCourtyard(this.art)
  private people = new ToyPeople(this.art)
  private server = this.people.create(1, 'server')
  private tray = new THREE.Group()
  private sculpted: SculptedServer | null = null
  private guests = new Map<number, ToyActor[]>()
  private journeys = new Map<ToyActor, GuestJourney>()
  private dishes = new Map<number, THREE.Group>()
  private initialized = false
  private disposed = false
  private yaw = 0
  private demoPosition = { x: -2.8, z: 1.15 }
  private demoPath: { x: number; z: number }[] = []
  private demoStop = 0
  private demoWait = 0
  private readonly stops = [{x:-2.6,z:-4.25},{x:-2.8,z:1.15},{x:0,z:2.1},{x:2.8,z:1.15},{x:2.2,z:-4.25}]
  constructor() {
    this.root.add(this.art.root); this.root.scale.setScalar(.65); this.root.rotation.y = Math.PI
    // Raise the entire terrace, not just the avatar: feet, furniture and carried
    // props stay grounded while the colleague's torso clears the serving sill.
    this.root.position.set(0, .45, -6.5)
    const a=this.art,r=a.root
    r.scale.z = FLOOR_DEPTH_SCALE
    a.place(r,a.box(ROOM.width,.15,ROOM.depth,'#4c4c48'),0,-.1,0)
    r.add(this.floor.root)
    for(const t of TABLES) {
      const table=a.place(r,new THREE.Group(),t.x,0,t.z)
      a.place(table,t.capacity===1?a.cylinder(.98,.20,'#9d6b45'):a.box(3,.20,2.08,'#9d6b45',.08),0,1,0)
      for(const x of [-.65,.65]) for(const z of [-.6,.6]) a.place(table,a.box(.12,.9,.12,'#593923'),x,.45,z)
      a.lantern(table,.25,1.3,0,.35)
      const plates=new THREE.Group();table.add(plates);a.dishes(plates,-.35,1.12,0,1,.65);this.dishes.set(t.id,plates)
      const guests=t.seats.map((seat,i)=>{
        const chair=a.place(r,new THREE.Group(),seat.x,0,seat.z);chair.rotation.y=seat.yaw
        a.place(chair,a.box(.85,.12,.82,'#65432b'),0,.52,0)
        a.place(chair,a.box(.85,.8,.10,'#65432b'),0,.95,-.40)
        for(const x of [-.32,.32]) for(const z of [-.30,.30]) a.place(chair,a.box(.09,.48,.09,'#65432b'),x,.24,z)
        const guest=this.people.create(t.id+i,'guest',true);guest.root.position.x=seat.x;guest.root.position.z=seat.z;guest.root.rotation.y=seat.yaw;r.add(guest.root);return guest
      });this.guests.set(t.id,guests)
      guests.forEach(guest=>this.journeys.set(guest,new GuestJourney(guest)))
    }
    r.add(this.server.root)
    this.server.root.add(this.tray)
    a.place(this.tray,a.box(.8,.06,.55,'#825030'),0,1.1,.52)
    a.dishes(this.tray,0,1.14,.52,1,.85)
    void SculptedServer.load().then(actor=>{if(this.disposed){actor.dispose();return}this.sculpted=actor;actor.root.scale.z=1/FLOOR_DEPTH_SCALE;r.add(actor.root);this.server.setBodyVisible(false)}).catch(()=>undefined)
  }
  private demo(dt:number): HallSight {
    this.demoWait=Math.max(0,this.demoWait-dt)
    if(!this.demoPath.length && !this.demoWait){this.demoPath=route(this.demoPosition,this.stops[this.demoStop]);this.demoStop=(this.demoStop+1)%this.stops.length;this.demoWait=.6}
    const next=this.demoPath[0]
    if(next){const dx=next.x-this.demoPosition.x,dz=next.z-this.demoPosition.z,d=Math.hypot(dx,dz),step=Math.min(d,dt*3.3);if(d<.08)this.demoPath.shift();else{this.demoPosition.x+=dx/d*step;this.demoPosition.z+=dz/d*step}}
    return {position:this.demoPosition,carrying:true,cleaning:false,tables:TABLES.map(t=>({id:t.id,people:t.capacity,eating:t.id%2===0,dirty:false}))}
  }
  update(dt:number,sight:HallSight|undefined,online:boolean,paused:boolean,reduced:boolean) {
    const state=sight ?? (online?undefined:this.demo(paused?0:dt))
    this.server.root.visible=!!state;if(this.sculpted)this.sculpted.root.visible=!!state
    if(!state){this.guests.forEach(list=>list.forEach(g=>g.root.visible=false));return}
    const p=this.server.root.position, target=state.position
    if(!this.initialized){p.set(target.x,0,target.z);this.initialized=true}
    const dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz),moving=!paused&&d>.025
    if(moving)this.yaw=Math.atan2(dx,dz)
    const blend=paused?0:1-Math.exp(-dt*15);p.x+=dx*blend;p.z+=dz*blend
    this.server.root.rotation.y=this.yaw
    this.tray.visible=state.carrying
    const pose={moving,carrying:state.carrying,cleaning:!paused&&state.cleaning,reduced:reduced||paused}
    this.server.pose(dt,pose)
    if(this.sculpted){this.sculpted.root.position.copy(p);this.sculpted.pose(dt,pose,this.yaw)}
    this.guests.forEach((guests,id)=>{const table=state.tables.find(t=>t.id===id);guests.forEach((guest,i)=>this.journeys.get(guest)!.update(!!table&&i<table.people,!!table?.eating,paused?0:dt,reduced));this.dishes.get(id)!.visible=!!table&&(table.people>0||table.dirty)})
    this.root.userData.serverPosition={x:p.x,z:p.z}
  }
  dispose(){this.disposed=true;this.sculpted?.dispose();this.people.dispose();this.courtyard.dispose();this.floor.texture.dispose();this.art.dispose()}
}
