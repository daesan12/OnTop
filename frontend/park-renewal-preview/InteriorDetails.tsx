import { annex, annexVolumes, galleryVolumes, passageVolumes, upperRamp, upperRoomVolumes } from './interiorAccess'
import { HorrorStoneMaterial } from './HorrorStoneMaterial'

export function AnnexDetails() {
  return <group name="renewal-annex-interior">
    <ambientLight intensity={.65} color="#ffe1ac" />
    <pointLight position={[-1.15, annex.floor + 1.9, -40.65]} intensity={26} distance={8} color="#ffaf58" />
    <pointLight position={[1.55, annex.floor + 2.25, -46.5]} intensity={12} distance={7} color="#f3c281" />
    {annexVolumes.map(({center, size, material}, index) => <mesh key={index} position={center}>
      <boxGeometry args={[...size]} />
      <meshLambertMaterial color={material === 'wood' ? '#8e582e' : '#8a7b66'} />
    </mesh>)}
    {[-.95,.25].map(x => <mesh key={x} position={[x,annex.floor+.58,-40.55]}>
      <boxGeometry args={[.9,.12,.62]} /><meshLambertMaterial color="#f2d8b2" />
    </mesh>)}
    <mesh position={[-1.66,annex.floor+.42,-41.52]}>
      <cylinderGeometry args={[.085,.07,.12,12]} /><meshLambertMaterial color="#cfad79" />
    </mesh>
    <mesh position={[-1.85,annex.floor+1.95,-40.15]}>
      <boxGeometry args={[.23,.34,.23]} /><meshBasicMaterial color="#ffc37f" />
    </mesh>
    <mesh position={[1.15,annex.floor+1.15,-47.61]}>
      <boxGeometry args={[1.45,2.3,.08]} /><meshLambertMaterial color="#696253" />
    </mesh>
  </group>
}

export function HallDetails() {
  const run = upperRamp.z0 - upperRamp.z1, rise = upperRamp.y1 - upperRamp.y0
  return <group>
    {passageVolumes.map(({center,size}, index) => <mesh key={index} position={center}>
      <boxGeometry args={[...size]} /><meshLambertMaterial color="#57574b" />
    </mesh>)}
    {[...galleryVolumes, ...upperRoomVolumes].map(({center,size,material}, index) => {
      if (material === 'guard') {
        const alongX = size[0] > size[2], length = alongX ? size[0] : size[2]
        const count = Math.ceil(length / 1.8)
        return <group key={index} position={center} rotation={[0,alongX ? 0 : Math.PI / 2,0]}>
          {[-.45,.5].map(y => <mesh key={y} position={[0,y,0]}>
            <boxGeometry args={[length,.1,.16]} /><meshLambertMaterial color="#706756" />
          </mesh>)}
          {Array.from({length:count+1}, (_, i) => <mesh key={i} position={[length*(i/count-.5),0,0]}>
            <boxGeometry args={[.12,1,.13]} /><meshLambertMaterial color="#817560" />
          </mesh>)}
        </group>
      }
      return <mesh key={index} position={center}>
        <boxGeometry args={[...size]} />
        {material === 'wood' ? <meshLambertMaterial color="#705340" /> : <HorrorStoneMaterial />}
      </mesh>
    })}
    <mesh position={[upperRamp.x, (upperRamp.y0 + upperRamp.y1) / 2 - .12, (upperRamp.z0 + upperRamp.z1) / 2]}
      rotation={[Math.atan2(rise,run),0,0]}>
      <boxGeometry args={[upperRamp.width,.24,Math.hypot(run,rise)]} />
      <meshLambertMaterial color="#797061" />
    </mesh>
    {([[-55,16.48,-90.3],[-45,14.3,-71],[-14,14.3,-54],[22,14.3,-76],[5,14.3,-91]] as const).map(position =>
      <group key={position.join(',')} position={position}>
        <mesh><boxGeometry args={[.2,.32,.2]} /><meshBasicMaterial color="#eac28e" /></mesh>
        <pointLight intensity={19} distance={13} color="#ffc68d" />
      </group>)}
    <pointLight position={[1.4,9.2,-50]} color="#a7a77d" intensity={12} distance={6} />
    <mesh position={[-57.98,13.46,-88]}>
      <boxGeometry args={[.22,3.2,2.4]} /><meshLambertMaterial color="#626258" />
    </mesh>
  </group>
}
