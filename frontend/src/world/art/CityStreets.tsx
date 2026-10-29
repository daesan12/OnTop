import { useMemo } from 'react'
import { RoundedCityStreets } from './RoundedCityStreets'
import { PARK_SIZE } from '../../config'
import { Instances, type Part } from './Instances'
import { SurfaceMaterial } from './SurfaceMaterial'
import { UrbanMaterial } from './UrbanMaterials'
import { NightMaterial } from '../NightLighting'

export function createCityStreets(parkSize = PARK_SIZE) {
  const halfSize=parkSize/2
  const asphalt: Part[] = [],
    paving: Part[] = [],
    stone: Part[] = [],
    paint: Part[] = [],
    metal: Part[] = [],
    lights: Part[] = [],
    round: Part[] = []
  for (let side = 0; side < 4; side++) {
    const a = (side * Math.PI) / 2,
      centre = -halfSize - 11.3
    const part = (
      list: Part[],
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      c: string,
    ) =>
      list.push({
        p: [
          Math.cos(a) * x + Math.sin(a) * z,
          y,
          -Math.sin(a) * x + Math.cos(a) * z,
        ],
        s: [w, h, d],
        r: [0, a, 0],
        c,
      })
    part(asphalt, 0, -0.065, centre, parkSize + 36, 0.12, 13.4, '#656c6c')
    part(
      paving,
      0,
      0.035,
      -halfSize - 2.3,
      parkSize + 8,
      0.14,
      4.6,
      '#b5b4a9',
    )
    part(
      paving,
      0,
      0.035,
      -halfSize - 21.5,
      parkSize + 50,
      0.14,
      7,
      '#bbb9ad',
    )
    for (const z of [-halfSize - 4.6, -halfSize - 18]) {
      part(stone, 0, 0.08, z, parkSize + 36, 0.23, 0.24, '#c8c5b9')
      for (let x = -halfSize; x <= halfSize; x += 8) {
        part(
          metal,
          x,
          0.017,
          z + (z > centre ? -0.3 : 0.3),
          0.6,
          0.035,
          0.4,
          '#343c3c',
        )
        for (let k = 0; k < 5; k++)
          part(
            stone,
            x - 0.24 + k * 0.12,
            0.038,
            z + (z > centre ? -0.3 : 0.3),
            0.035,
            0.015,
            0.37,
            '#6a7471',
          )
      }
    }
    // Centre double yellow, lane dividers and stop lines leave the crossing open.
    for (let x = -halfSize - 14; x < halfSize + 14; x += 6) {
      if (Math.abs(x) < 7) continue
      for (const lane of [-3.3, 3.3])
        part(paint, x, 0.004, centre + lane, 3, 0.012, 0.11, '#e8e5d9')
    }
    for (const lane of [-0.13, 0.13])
      for (const s of [-1, 1])
        part(
          paint,
          s * (halfSize / 2 + 5),
          0.004,
          centre + lane,
          halfSize - 4,
          0.012,
          0.1,
          '#d5ac45',
        )
    for (const lane of [-6.25, 6.25])
      part(paint, 0, 0.004, centre + lane, parkSize + 36, 0.012, 0.1, '#c6c8bc')
    for (let z = -6; z < 6.1; z += 0.9)
      part(paint, 0, 0.011, centre + z, 4.5, 0.018, 0.48, '#e9e7da')
    for (const s of [-1, 1]) {
      part(paint, s * 4, 0.011, centre + s * 3.3, 0.32, 0.018, 5.8, '#ece9dc')
      part(paving, 0, 0.12, centre + s * 7.9, 4.7, 0.035, 0.6, '#c8ae67')
      // Pedestrian signal poles and bollards frame the crossing.
      part(metal, s * 3.8, 1.7, centre + s * 7.7, 0.12, 3.4, 0.12, '#414e4e')
      part(metal, s * 3.8, 2.9, centre + s * 7.7, 0.32, 0.6, 0.22, '#293939')
      part(lights, s * 3.8, 3.02, centre + s * 7.55, 0.13, 0.16, 0.03, '#e79c70')
    }
    for (let x = -72; x <= 72; x += 16) {
      if (Math.abs(x) < 7) continue
      part(metal, x, 0.48, centre + 7.6, 0.16, 0.96, 0.16, '#434e4d')
      part(paint, x, 0.79, centre + 7.6, 0.17, 0.1, 0.17, '#d9cf9e')
    }
    for (let x = -70; x <= 70; x += 35) {
      part(round, x, 0.008, centre + 4.7, 0.39, 0.025, 0.39, '#5b6261')
      const z = centre - 8.2
      part(metal, x, 4.8, z, 0.15, 9.6, 0.15, '#65736f')
      part(metal, x, 9.45, z + 1.1, 0.15, 0.14, 2.2, '#65736f')
      part(metal, x, 9.35, z + 2, 0.45, 0.2, 1.3, '#414e4d')
      part(lights, x, 9.23, z + 2, 0.36, 0.035, 1.1, '#e9e5ca')
    }
  }
  return {asphalt,paving,stone,paint,metal,lights,round}
}
export function CityStreets({parkSize=PARK_SIZE,cornerRadius=0}:{parkSize?:number;cornerRadius?:number}={}) {
  const {asphalt,paving,stone,paint,metal,lights,round}=useMemo(()=>createCityStreets(parkSize),[parkSize])
  return (
    <group name="city-streets">
      {cornerRadius>0?<RoundedCityStreets parkSize={parkSize} radius={cornerRadius} parts={{paving,stone,paint,metal,round,lights}}/>:<>
      <Instances
        parts={asphalt}
        shadow={false}
        material={<UrbanMaterial kind="asphalt" />}
      >
        <boxGeometry />
      </Instances>
      <Instances
        parts={paving}
        shadow={false}
        material={
          <SurfaceMaterial
            kind="stone"
            mapping="box"
            meters={1.4}
            paving
            detail={0.32}
            strength={0.18}
          />
        }
      >
        <boxGeometry />
      </Instances>
      <Instances
        parts={stone}
        shadow={false}
        material={
          <SurfaceMaterial
            kind="stone"
            mapping="box"
            detail={0.25}
            strength={0.1}
          />
        }
      >
        <boxGeometry />
      </Instances>
      <Instances parts={paint} shadow={false}>
        <boxGeometry />
      </Instances>
      <Instances
        parts={metal}
        shadow={false}
        material={<meshStandardMaterial roughness={0.65} metalness={0.4} />}
      >
        <boxGeometry />
      </Instances>
      <Instances parts={round} shadow={false}>
        <cylinderGeometry args={[1, 1, 1, 16]} />
      </Instances>
      <Instances
        parts={lights}
        shadow={false}
        material={<NightMaterial strength={0.6} />}
      >
        <boxGeometry />
      </Instances>
      </>}
    </group>
  )
}
