import {describe,it,expect} from 'vitest'
import {MapAdmission,LIVE_MAP_IDENTITY,parseMapIdentity} from '../../src/network/mapContract'
import {PARK_MAP_ID,PARK_MAP_SCHEMA_VERSION,PARK_MAP_VERSION} from '../../src/map/park/generated/mapVersion'
const generated={mapId:PARK_MAP_ID,schemaVersion:PARK_MAP_SCHEMA_VERSION,mapVersion:PARK_MAP_VERSION}
describe('map admission contract',()=>{
  it('requires all three fields before entry or recovery and sends the exact FE identity',()=>{
    const gate=new MapAdmission(generated,true)
    expect(()=>gate.request({channelId:'c'})).toThrow()
    expect(gate.connected(generated)).toBe(true)
    expect(gate.request({channelId:'c'})).toEqual({channelId:'c',map:generated})
    expect(gate.request()).toEqual({map:generated})
  })
  it.each([{...generated,mapId:'other'},{...generated,schemaVersion:1},{...generated,mapVersion:'a'.repeat(64)},undefined,null,{...generated,mapVersion:'oops'}])('blocks mismatched or missing metadata: %j',server=>{
    const gate=new MapAdmission(generated,true)
    expect(gate.connected(server)).toBe(false);expect(gate.allowed).toBe(false)
    expect(gate.connected(generated)).toBe(false)
    gate.reset();expect(gate.connected(generated)).toBe(true)
  })
  it('preserves legacy service rollout without ever labelling its scene with the preview version',()=>{
    const gate=new MapAdmission({mapId:'park',schemaVersion:1,mapVersion:'0'.repeat(64)})
    expect(gate.connected(undefined)).toBe(true);expect(gate.status).toBe('legacy')
    expect(gate.request()).toEqual({})
    expect(gate.request({channelId:'c'})).toEqual({channelId:'c'})
    expect(gate.expected).not.toEqual(LIVE_MAP_IDENTITY)
    expect(gate.expected.mapVersion).not.toBe(PARK_MAP_VERSION)
    gate.reset();expect(gate.connected(generated)).toBe(false)
  })
  it('retains only validated server metadata from a mismatch response and latches rejection',()=>{
    const gate=new MapAdmission(generated,true);gate.connected(generated)
    const server={...generated,mapVersion:'b'.repeat(64),privateToken:'not-a-map-field'}
    gate.reject(server)
    expect(gate.serverMap).toEqual(parseMapIdentity(server));expect(gate.serverMap).not.toHaveProperty('privateToken')
    expect(()=>gate.request()).toThrow();expect(gate.allowed).toBe(false)
  })
})
