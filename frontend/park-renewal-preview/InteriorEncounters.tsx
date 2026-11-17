import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, type Group, type Light, type Mesh, type Object3D, type PointLight } from 'three'
import { effectsOutput } from '../src/audio/bgm'
import { playEncounterSound } from './horrorAudio'
import { diamond, interiorVisit, type Encounter } from './interiorEvents'
import { encounterModels, Shape } from './InteriorEncounterModels'
import { useEncounterWarmup } from './encounterWarmup'

const types = Array.from({ length: 12 }, (_, i) => i + 1)
const beatsByScene = [
  [0,.19], [0,.24,.50], [.02,.42], [0,.12,.31], [.05,.28], [.17,.5],
  [0,.11,.21,.31,.47], [.04,.54], [0,.34,.55], [0,.14,.26,.38],
  [0,.24,.46,.62], [.05,.14,.25,.36,.49,.64],
]
const clamp = (x: number) => Math.max(0, Math.min(1, x))
const ease = (x: number) => { const n = clamp(x); return n * n * (3 - 2*n) }

function cue(id: number, duration: number) {
  const output = effectsOutput()
  if (output) playEncounterSound(output.context, output.bus, id, duration, beatsByScene[id-1] ?? [])
}

function animate(id: number, scene: Object3D, t: number, viewer: Vector3) {
  switch (id) {
    case 1:
      scene.position.x = -.30 + .32 * ease(t * 2)
      scene.rotation.z = .18 * (1 - ease(t*2))
      break
    case 2: {
      const steps = ease(t*5) + ease((t-.23)*5) + ease((t-.54)*5)
      scene.position.z = steps * .13
      scene.rotation.z = Math.sin(steps * Math.PI) * .033
      break
    }
    case 3:
      scene.position.y = 1.8 * (1-ease(t*1.65)) + .85
      scene.rotation.z = Math.sin(t*7) * .12
      break
    case 4: {
      const door = scene.getObjectByName('door-leaf')!
      const beast = scene.getObjectByName('door-beast')!
      door.rotation.y = -1.04 * ease(t*2.1)
      beast.scale.setScalar(.76 + .24 * ease(t*4))
      beast.position.z = -.36 + .72 * ease((t-.19)*1.8)
      beast.position.x = .22 * ease(t*1.5)
      break
    }
    case 5: {
      const hand = scene.getObjectByName('reaching-hand')!
      hand.position.x = -.48 + .57 * Math.sin(t*Math.PI)
      hand.rotation.z = -.15 * Math.sin(t*12)
      break
    }
    case 6: {
      const shadow = scene.getObjectByName('wall-shadow')!
      shadow.scale.set(1,1 + .53 * Math.sin(t*Math.PI),1)
      shadow.rotation.z = -.3 * Math.sin(t*Math.PI)
      break
    }
    case 7:
      scene.children.slice(0,-1).forEach((step,i) => { step.visible = t > i*.09 && t < .65+i*.065 })
      scene.children.at(-1)!.position.set(.65 - t*1.6,0,-1.46 + ease((t-.33)*1.65)*.9)
      scene.children.at(-1)!.visible = t > .32
      break
    case 8:
      scene.getObjectByName('lift-passenger')!.position.y = -.88 + .88 * ease(t*2.4)
      scene.getObjectByName('lift-passenger')!.rotation.y = .65 - 1.2 * ease((t-.32)*2)
      break
    case 9:
      scene.position.z = .4 * ease((t-.3)*1.6)
      scene.scale.setScalar(.88 + .15 * ease(t))
      break
    case 10: {
      const approach = ease(t*1.4)
      scene.position.set(-.31*(1-approach),Math.sin(t*Math.PI)*.026,.37*approach)
      scene.rotation.y = .24*(1-approach)
      scene.rotation.z = Math.sin(t*Math.PI*2)*.024
      break
    }
    case 11: {
      const water = scene.getObjectByName('pool-ripples')!
      const figure = scene.getObjectByName('pool-figure')!
      const surge = ease((t-.22)*1.65)
      water.scale.setScalar(.43 + .63 * ease(t*2))
      water.rotation.z = t*.23
      figure.visible = t > .24
      figure.position.set(0,-.19+.19*surge,.04*surge)
      figure.scale.set(1,Math.max(.04,.85*surge),1)
      figure.rotation.x = .29 * (1-surge)
      break
    }
    case 12: {
      const wall = scene.getObjectByName('watcher-wall')!
      wall.children.forEach((eye,i) => {
        const lid = eye.getObjectByName('watcher-lid')!
        const pupil = eye.getObjectByName('watcher-pupil')!
        const delay = i === 0 ? .08 : .21 + Math.abs(eye.position.x)*.13 + (i%4)*.04
        lid.scale.y = .04 + .96 * ease((t-delay)*3.8)
        pupil.position.x = Math.max(-.078, Math.min(.078, (viewer.x-eye.position.x)*.038))
        pupil.position.y = Math.max(-.033, Math.min(.033, (viewer.y-eye.position.y)*.032))
      })
      break
    }
  }
}

function diamondCue() {
  const output = effectsOutput()
  if (!output) return
  const {context,bus} = output
  for (const [index, delay] of [.025,.37].entries()) {
    const at = context.currentTime + delay
    const osc = context.createOscillator(), gain = context.createGain()
    const pan = context.createStereoPanner()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(172, at)
    osc.frequency.exponentialRampToValueAtTime(53, at + .19)
    gain.gain.setValueAtTime(.075, at)
    gain.gain.exponentialRampToValueAtTime(.001, at + .22)
    pan.pan.value = index ? .8 : -.8
    osc.connect(gain).connect(pan).connect(bus)
    osc.start(at)
    osc.stop(at + .23)
    osc.onended = () => { osc.disconnect(); gain.disconnect(); pan.disconnect() }
  }
}

export function InteriorEncounters() {
  const objects = useRef<(Group | null)[]>([])
  const gem = useRef<Mesh>(null)
  const previous = useRef<Encounter | undefined>(undefined)
  const hadDiamond = useRef(false)
  const lighting = useRef<{ lights: Light[]; intensity: number[] } | undefined>(undefined)
  const stage = useRef<Group>(null)
  const viewer = useRef(new Vector3())
  const accent = useRef<PointLight>(null)
  useEncounterWarmup(stage)
  useFrame(({camera}, dt) => {
    const active = interiorVisit.active
    if (active !== previous.current) {
      if (previous.current) {
        const old = objects.current[previous.current.id]
        if (old) old.visible = false
      }
      if (lighting.current) {
        lighting.current.lights.forEach((light, i) => { light.intensity = lighting.current!.intensity[i]! })
        lighting.current = undefined
      }
      if (accent.current) accent.current.intensity = 0
      if (active) {
        const group = objects.current[active.id]
        if (group) {
          const [x,y,z] = active.at
          group.position.set(x,y-.78,z)
          group.rotation.y = Math.atan2(camera.position.x-x,camera.position.z-z)
          group.visible = true
          if (accent.current) {
            const facing = group.rotation.y
            accent.current.position.set(x + .65*Math.sin(facing) + .7*Math.cos(facing), y+.77,
              z + .65*Math.cos(facing) - .7*Math.sin(facing))
            accent.current.color.set(active.id === 11 ? '#a0bdad' : '#e5bc93')
            accent.current.intensity = active.id === 9 ? 2.6 : active.id === 12 ? 8 : 6
          }
          active.presentedAt = performance.now()
          if (active.id === 9 || active.id === 12) {
            const lights: Light[] = []
            stage.current?.parent?.traverse(object => {
              const light = object as Light
              if (light.isLight && light !== accent.current && light.position.distanceTo(group.position) < 13) lights.push(light)
            })
            lighting.current = { lights, intensity: lights.map(light => light.intensity) }
          }
          cue(active.id, active.duration)
        }
      }
      previous.current = active
    }
    if (gem.current) {
      if (interiorVisit.added && !hadDiamond.current) diamondCue()
      hadDiamond.current = interiorVisit.added
      gem.current.visible = !interiorVisit.added
      gem.current.rotation.y += dt
    }
    if (!active || active.presentedAt === undefined) return
    const group = objects.current[active.id]
    if (!group) return
    const t = clamp((performance.now() - active.presentedAt) / active.duration)
    const child = group.children[0]
    if (!child) return
    viewer.current.copy(camera.position)
    if (active.id === 12) group.worldToLocal(viewer.current)
    animate(active.id, child, t, viewer.current)
    const dimmed = lighting.current
    if (dimmed) {
      const intensity = 1 - (active.id === 9 ? .34 : .21) * ease(t*1.8)
      dimmed.lights.forEach((light,i) => { light.intensity = dimmed.intensity[i]! * intensity })
    }
  }, .65)
  const [x,y,z] = diamond
  return <group ref={stage}>
    <pointLight ref={accent} intensity={0} distance={3.8} decay={2} />
    <Shape at={[x,y-.62,z]} size={[.64,1.04,.64]} color="#5a5750" />
    <mesh position={[x,y,z]} ref={gem} rotation={[0,0,.14]}>
      <octahedronGeometry args={[.31,0]} /><meshBasicMaterial color="#99f6ef" />
    </mesh>
    {types.map(id => <group name={'interior-event-' + id} key={id} ref={node => {objects.current[id]=node}} visible={false}>
      <group>{encounterModels[id]}</group>
    </group>)}
  </group>
}
