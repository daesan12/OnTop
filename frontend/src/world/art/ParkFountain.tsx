import { SIMPLE_MAP } from './mapRenderProfile'
import { FOUNTAIN, type QualityPreset } from '../../config'
import { SurfaceMaterial } from './SurfaceMaterial'
import { FountainEffects } from './FountainEffects'
import { Water } from './WaterGarden'
import { FountainRefinements } from './LandmarkRefinements'
import { PlazaGarden } from './PlazaGarden'
export function ParkFountain({ quality,jetHeightScale=1 }: { quality: QualityPreset;jetHeightScale?:number }) {
  return (
    <group>
      <PlazaGarden />
      <FountainRefinements />
      <group
        name="reference-fountain"
        position={[FOUNTAIN.x, -FOUNTAIN.plazaDepth, FOUNTAIN.z]}
      >
        <mesh position={[0, 0.12, 0]} receiveShadow>
          <cylinderGeometry args={[5.2, 5.4, 0.24, SIMPLE_MAP ? 16 : 64]} />
          <SurfaceMaterial
            kind="stone"
            mapping="box"
            meters={0.85}
            detail={0.55}
            strength={0.22}
            color="#c6c5b7"
          />
        </mesh>
        <mesh position={[0, 0.26, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[4.8, SIMPLE_MAP ? 16 : 64]} />
          <meshStandardMaterial
            color="#709f9c"
            roughness={0.2}
            metalness={0.25}
          />
        </mesh>
        <mesh position={[0, 0.45, 0]}>
          <cylinderGeometry args={[5, 5, 0.65, SIMPLE_MAP ? 16 : 96, 1, true]} />
          <SurfaceMaterial
            kind="stone"
            mapping="box"
            meters={0.85}
            detail={0.55}
            strength={0.22}
            color="#b2b5a9"
            side={2}
          />
        </mesh>
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.6, 0.85, 0.4, 20]} />
          <meshStandardMaterial
            color="#859a94"
            metalness={0.5}
            roughness={0.4}
          />
        </mesh>
        <Water position={[0, 0.63, 0]} radius={[4.8, 4.8]} />
        <group name="fountain-jet-height" position={[0,.64*(1-jetHeightScale),0]} scale={[1,jetHeightScale,1]}><FountainEffects quality={SIMPLE_MAP ? 'low' : quality} /></group>
      </group>
    </group>
  )
}
