import { describe,it,expect } from 'vitest'
import { createBirds,stepBird,type BirdEnvironment } from '../../src/world/pigeons/pigeonSimulation'

describe('original pigeon behavior on a supplied map',()=>{
  const sites=[{x:0,z:0},{x:8,z:0},{x:-8,z:0}]
  it('uses the supplied terrain when spawning and landing after a scare flight',()=>{
    const bird=createBirds(0,sites,{x:0,z:0},()=>3)[0]!
    expect(bird.y).toBeCloseTo(3.08)
    const environment:BirdEnvironment={groundHeight:()=>3,clearRoute:()=>true}
    stepBird(bird,.05,[{x:-2,z:0,y:3.88,vx:10,vz:0}],sites,environment)
    expect(bird.mode).toBe('fly')
    for(let i=0;i<60;i++)stepBird(bird,.1,[],sites,environment)
    expect(bird.mode).not.toBe('fly');expect(bird.y).toBeCloseTo(3.08)
  })
  it('keeps a bird grounded when the supplied map blocks every escape route',()=>{
    const bird=createBirds(0,sites,{x:0,z:0},()=>3)[0]!
    stepBird(bird,.05,[{x:-2,z:0,y:3.88,vx:10,vz:0}],sites,{groundHeight:()=>3,clearRoute:()=>false})
    expect(bird.mode).toBe('idle');expect(bird.x).toBe(0);expect(bird.z).toBe(0)
  })
})
