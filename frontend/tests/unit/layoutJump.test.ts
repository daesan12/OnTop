import { describe,it,expect } from 'vitest'
import { JUMP_PADS,JUMP_GATES,JUMP_SEQUENCE,JUMP_STAGES,JUMP_START,JUMP_FINISH,containsJumpPad } from '../../src/layout-preview/jumpCourse'
import { createJumpSession,stepJump,queueJump,landJumpPad,JUMP_RULES } from '../../src/layout-preview/jumpSimulation'
import { clearReturnSegment,findJumpReturnPath } from '../../src/layout-preview/jumpNavigation'

describe('FE-only planned jump course',()=>{
  it('has the specified seven themes, 107 pads, six sequential gates and original first-stage IDs',()=>{
    expect(JUMP_PADS).toHaveLength(107);expect(JUMP_GATES).toHaveLength(6);expect(JUMP_SEQUENCE).toHaveLength(113)
    expect(JUMP_STAGES.map((_,i)=>JUMP_PADS.filter(p=>p.stage===i).length)).toEqual([24,9,13,12,17,18,14])
    expect(JUMP_STAGES.reduce((sum,s)=>sum+s.reward,0)).toBe(100)
    expect(JUMP_PADS.slice(0,24).map(p=>p.id)).toEqual(Array.from({length:24},(_,i)=>`future-jump-pad-${i}`))
    expect(new Set(JUMP_SEQUENCE.map(p=>p.id)).size).toBe(113)
    expect(Math.max(...JUMP_PADS.map(p=>p.height))).toBeCloseTo(46.5,1)
    expect(JUMP_PADS.at(-1)!.height).toBe(8)
  })
  it('keeps every consecutive jump reachable with the planned walking speed and gravity',()=>{
    for(let i=1;i<JUMP_SEQUENCE.length;i++) {
      const a=JUMP_SEQUENCE[i-1]!,b=JUMP_SEQUENCE[i]!,dy=b.height-a.height,discriminant=6.2**2-36*dy
      expect(discriminant,`${a.id} → ${b.id} rise`).toBeGreaterThan(0)
      const flight=(6.2+Math.sqrt(discriminant))/18,distance=Math.hypot(a.x-b.x,a.z-b.z)
      const edgeA=a.radius??Math.min(a.halfX,a.halfZ),edgeB=b.radius??Math.min(b.halfX,b.halfZ)
      expect(distance-edgeA-edgeB+.3,`${a.id} → ${b.id} gap`).toBeLessThan(flight*6.25)
    }
  })
  it('starts on actual swept landing of the first pad, rather than proximity or pressing a button',()=>{
    const s=createJumpSession(),p=JUMP_PADS[0]!
    expect(s.active).toBe(false)
    s.x=p.x;s.z=p.z;s.y=p.height+.3;s.vy=-4;s.grounded=false
    stepJump(s,.1,{x:0,z:0})
    expect(s.active).toBe(true);expect(s.pad?.id).toBe(p.id);expect(s.y).toBeCloseTo(p.height)
    const count=s.hits.length;stepJump(s,.1,{x:0,z:0});expect(s.hits).toHaveLength(count)
  })
  it('grants gates only in order and never twice, then completes only after the final leaf and water',()=>{
    const s=createJumpSession();landJumpPad(s,JUMP_PADS[0]!);landJumpPad(s,JUMP_GATES[2]!)
    expect(s.coins).toBe(0)
    for(const g of JUMP_GATES){s.time+=1;landJumpPad(s,g);const before=s.coins;landJumpPad(s,g);expect(s.coins).toBe(before)}
    expect(s.coins).toBe(64);landJumpPad(s,JUMP_PADS.at(-1)!)
    s.x=JUMP_FINISH.x;s.z=JUMP_FINISH.z;s.y=8;s.vy=0;s.grounded=false;s.pad=null
    for(let i=0;i<120;i++)stepJump(s,1/60,{x:0,z:0})
    expect(s.result?.kind).toBe('complete');expect(s.today).toBe(100);expect(s.coins).toBe(100);expect(s.bestTime).toBeGreaterThan(0)
    landJumpPad(s,JUMP_PADS[0]!);for(const g of JUMP_GATES)landJumpPad(s,g);expect(s.coins).toBe(0)
  })
  it('ends an early water fall without granting the final reward and never teleports the player',()=>{
    const s=createJumpSession();landJumpPad(s,JUMP_PADS[0]!);landJumpPad(s,JUMP_GATES[0]!)
    s.x=JUMP_FINISH.x;s.z=JUMP_FINISH.z;s.y=.1;s.grounded=false;s.pad=null;s.vy=-3
    stepJump(s,.1,{x:0,z:0})
    expect(s.result?.kind).toBe('water');expect(s.coins).toBe(2);expect(s.x).toBe(JUMP_FINISH.x);expect(s.z).toBe(JUMP_FINISH.z)
  })
  it('supports a 100ms coyote window once and a 150ms pre-landing jump buffer',()=>{
    const s=createJumpSession(),p=JUMP_PADS[0]!
    Object.assign(s,{x:p.x+p.halfX+.15,z:p.z,y:p.height,grounded:true,pad:p})
    stepJump(s,.025,{x:1,z:0});expect(s.grounded).toBe(false)
    queueJump(s);stepJump(s,.016,{x:0,z:0});expect(s.vy).toBeGreaterThan(5);expect(s.jumped).toBe(true)
    const first=s.vy;queueJump(s);stepJump(s,.02,{x:0,z:0});expect(s.vy).toBeLessThan(first)
    const buffered=createJumpSession();Object.assign(buffered,{x:p.x,z:p.z,y:p.height+.3,vy:-3,grounded:false})
    queueJump(buffered);stepJump(buffered,.12,{x:0,z:0});expect(buffered.vy).toBeGreaterThan(4)
    expect(JUMP_RULES.coyote).toBe(.1);expect(JUMP_RULES.buffer).toBe(.15)
  })
  it('traverses all 113 surfaces with the actual controller, including every turn and the dive approach',()=>{
    const s=createJumpSession(),first=JUMP_SEQUENCE[0]!
    Object.assign(s,{x:first.x,z:first.z,y:first.height,grounded:true,pad:first});landJumpPad(s,first)
    for(let index=1;index<JUMP_SEQUENCE.length;index++) {
      const a=JUMP_SEQUENCE[index-1]!,b=JUMP_SEQUENCE[index]!,dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz),ux=dx/l,uz=dz/l
      const radius=a.radius??Math.min(a.halfX/Math.max(.001,Math.abs(ux)),a.halfZ/Math.max(.001,Math.abs(uz)))
      const launch={x:a.x+ux*Math.max(0,radius-.32),z:a.z+uz*Math.max(0,radius-.32)}
      for(let i=0;i<180&&Math.hypot(s.x-launch.x,s.z-launch.z)>.07;i++)stepJump(s,1/120,{x:launch.x-s.x,z:launch.z-s.z})
      queueJump(s)
      for(let i=0;i<300;i++) {
        const distance=Math.hypot(b.x-s.x,b.z-s.z)
        stepJump(s,1/120,{x:distance<.06?0:b.x-s.x,z:distance<.06?0:b.z-s.z})
        if(s.pad?.id===b.id&&s.grounded)break
      }
      expect(s.pad?.id,'controller landing '+index+' '+b.id).toBe(b.id)
    }
    expect(s.nextGate).toBe(7);expect(s.lastLeaf).toBe(true)
  })
  it('finds a walkable return route through the actual park gates, without cutting fences',()=>{
    const route=findJumpReturnPath({x:0,z:82})
    expect(route.length).toBeGreaterThan(2);expect(route.at(-1)).toEqual(JUMP_START)
    for(let i=1;i<route.length;i++)expect(clearReturnSegment(route[i-1]!,route[i]!)).toBe(true)
    expect(containsJumpPad(JUMP_PADS[0]!,JUMP_PADS[0]!.x,JUMP_PADS[0]!.z)).toBe(true)
  })
})
