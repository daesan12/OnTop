import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { LAKE, WORLD, MOVEMENT, FOUNTAIN, MINI_PROPS } from '../../src/config'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
import { PARK_DESTINATIONS, findParkRoute, isNavigationWalkable, navigationHeight } from '../../src/features/navigation/parkNavigation'
import { useNavigation, selectDestination, cancelNavigation, openParkMap, closeParkMap } from '../../src/features/navigation/navigationState'
import { inputState } from '../../src/world/inputOwnership'

it('rejects water, bounds, non-finite inputs and tower shortcuts without a fabricated straight line',()=>{
  for(const point of [{x:LAKE.x,z:LAKE.z},{x:WORLD.halfSize+1,z:0},{x:NaN,z:0},{x:0,z:Infinity}])expect(findParkRoute({x:0,z:34},point)).toBeNull()
  expect(isNavigationWalkable({x:56,z:50})).toBe(false)
})
it('walks across the wooden bridge instead of swimming and can leave the raised pavilion on its stairs',()=>{
  const crossing=findParkRoute({x:40,z:20},{x:74,z:20})
  expect(crossing?.some(p=>p.x>50&&p.x<60&&Math.abs(p.z-20)<1.5)).toBe(true)
  expect(findParkRoute({x:0,z:10},{x:0,z:34})).not.toBeNull()
  expect(navigationHeight({x:0,z:10})).toBe(2)
})
it('anchors routes and destinations to snapshots instead of the mutable avatar renderer ref',()=>{
  const pose={x:0,z:34}, target={...PARK_DESTINATIONS.mailbox!,name:'소리함'}
  const path=findParkRoute(pose,target)!
  pose.x=50; expect(path[0]).toEqual({x:0,z:34})
  selectDestination(target,'101','channel-1'); target.x=500
  expect(useNavigation.getState()).toMatchObject({owner:'101',channel:'channel-1',target:{x:-10.8,z:16},status:'planning'})
  cancelNavigation(); expect(useNavigation.getState()).toMatchObject({owner:'',channel:'',target:null,path:[],status:'idle'})
})
it('reuses the approved map fingerprint, metres and movement parameters without writing a new physics contract',()=>{
  const baked=JSON.parse(readFileSync('../backend/src/main/resources/world/park.json','utf8'))
  expect(baked.sourceSha256).toBe(EXPECTED_MAP_VERSION)
  expect(baked.units).toBe('m'); expect(baked.upAxis).toBe('Y')
  for(const [key,value] of Object.entries(MOVEMENT))expect(baked.movement[key]).toBe(value)
  expect(PARK_DESTINATIONS.fountain).toEqual({x:FOUNTAIN.x,z:FOUNTAIN.z+FOUNTAIN.plazaRadius+1})
  expect(PARK_DESTINATIONS.mini).toEqual({x:MINI_PROPS[0].x,z:MINI_PROPS[0].z+3})
})
it('map ownership clears held input and releases only its own flag',()=>{
  vi.stubGlobal('window',new EventTarget())
  let clears=0;window.addEventListener('ontop-clear-input',()=>clears++)
  inputState.manualOpen=true;inputState.chatOpen=true
  openParkMap();expect(inputState.mapOpen).toBe(true)
  closeParkMap();expect(inputState).toMatchObject({mapOpen:false,manualOpen:true,chatOpen:true})
  expect(clears).toBe(2)
})
afterEach(()=>{closeParkMap();cancelNavigation();Object.keys(inputState).forEach(k=>inputState[k as keyof typeof inputState]=false);vi.unstubAllGlobals()})
