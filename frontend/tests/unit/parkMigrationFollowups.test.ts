import {describe,it,expect} from 'vitest'
import {createPigeonVisitorSampler} from '../../src/world/pigeons/visitorMotion'
import {createBirds,stepBird,type Visitor} from '../../src/world/pigeons/pigeonSimulation'
import {pavilionLanternLayout} from '../../src/world/art/pavilionLanternLayout'
import {PARK_DATA,PARK_LAYOUT} from '../../src/map/park'
import {simpleEnvironmentPalette} from '../../src/world/simpleEnvironmentPalette'
import {targetFade} from '../../src/features/jumpmap/course'
import {Color} from 'three'

describe('new park migration follow-ups',()=>{
  it('scares the original pigeon behavior with real frame velocities at different socket cadences',()=>{
    const environment={groundHeight:()=>0,clearRoute:()=>true}
    for(const ms of [16,50,100]) {
      const sample=createPigeonVisitorSampler(),bird=createBirds(0,[{x:0,z:0}],{x:0,z:0},()=>0)[0]!
      sample('runner',{x:-3-9*ms/1000,y:.8,z:0},0,true,9)
      const visitor=sample('runner',{x:-3,y:.8,z:0},ms,true,9)
      stepBird(bird,.016,[visitor],[{x:0,z:7},{x:0,z:-7}],environment)
      expect(bird.mode).toBe('fly')
    }
  })
  it('does not scare birds with walking, seated movement, stale frames or relocation jumps',()=>{
    const sample=createPigeonVisitorSampler()
    sample('visitor',{x:0,y:.8,z:0},0,true,9)
    for(const [pose,at,running] of [[{x:.5,y:.8,z:0},100,false],[{x:20,y:.8,z:0},116,true],[{x:21,y:.8,z:0},1000,true]] as const) {
      const p:Visitor=sample('visitor',pose,at,running,9)
      expect(Math.hypot(p.vx,p.vz)).toBe(0)
    }
  })
  it('moves every hanging light and its suspension with its own pavilion, including changed floors',()=>{
    const pavilions=PARK_LAYOUT.DRAFT_PAVILIONS,layout=pavilionLanternLayout(pavilions)
    expect(layout.placements).toHaveLength(13)
    pavilions.forEach((p,n)=>{
      const lamp=layout.placements[n]!
      expect([lamp.p[0],lamp.p[2]]).toEqual([p.x,p.z])
      expect(lamp.p[1]).toBeGreaterThan(p.floor+2)
    })
    const moved=pavilions.map(p=>({...p,x:p.x+4,z:p.z-3,floor:p.floor+.5}))
    const after=pavilionLanternLayout(moved)
    layout.placements.forEach((p,n)=>expect(after.placements[n]!.p).toEqual([p.p[0]+4,p.p[1]+.5,p.p[2]-3]))
    expect(layout.simpleChains).toHaveLength(13)
    expect(layout.simpleChains.every(p=>p.s[1]>0)).toBe(true)
  })
  it('keeps all 18 game IDs and four chair proxies aligned without making railings tall walls',()=>{
    for(const t of PARK_DATA.tables) {
      const top=PARK_DATA.physics.boxes.find(b=>b.id===t.id+'-top')!
      expect(top.center[1]-top.half[1]).toBeCloseTo(t.position[1])
      expect(top.half[1]*2).toBe(2.5)
      t.seatAnchors.forEach(([x,,z],n)=>{
        const chair=PARK_DATA.physics.boxes.find(b=>b.id===`${t.id}-chair-${n}`)!
        expect(chair.center[0]).toBeCloseTo(t.position[0]+x)
        expect(chair.center[2]).toBeCloseTo(t.position[2]+z)
      })
    }
    const rails=PARK_DATA.physics.boxes.filter(b=>/P\d-balustrade-/.test(b.id))
    expect(rails).toHaveLength(54)
    expect(rails.every(b=>Math.abs(b.half[1]*2-1.22)<1e-8)).toBe(true)
  })
  it('keeps a dark night sky with playable ambient lighting, while high course pads remain translucent',()=>{
    const luminance=(hex:string)=>{const c=new Color(hex);return .2126*c.r+.7152*c.g+.0722*c.b}
    expect(luminance(simpleEnvironmentPalette.nightSky)).toBeLessThan(luminance(simpleEnvironmentPalette.daySky)/10)
    expect(simpleEnvironmentPalette.nightFill).toBeGreaterThanOrEqual(simpleEnvironmentPalette.dayFill*.7)
    expect(simpleEnvironmentPalette.nightFill).toBeLessThan(simpleEnvironmentPalette.dayFill)
    expect(targetFade(45,3,false,false,false)).toBeLessThan(targetFade(3,3,false,false,false))
    expect(targetFade(45,3,false,false,false)).toBeGreaterThan(0)
  })
})
