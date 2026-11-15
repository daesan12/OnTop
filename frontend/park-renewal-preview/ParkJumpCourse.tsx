import { Instances, type Part } from '../src/world/art/Instances'
import { jumpArt } from '../src/layout-preview/jumpGeometry'
import { creatureJumpArt } from './creatureJumpArt'
import { JUMP_FINISH, JUMP_GATES, JUMP_PADS, type JumpPad } from './jump10Plan'
import { JumpCourseGeometry } from './ParkDetailGeometry'

const art = { ...jumpArt, ...creatureJumpArt }
const byTheme = new Map<JumpPad['theme'], Part[]>()
for (const pad of [...JUMP_PADS, ...JUMP_GATES]) {
  const { theme, stage, halfX, halfZ, radius } = pad
  const width = stage < 6 ? (theme === 'stone' ? halfX / .9 : 1)
    : theme === 'duck' ? halfX / .68
      : theme === 'mole' ? radius! / .68
        : theme === 'pigeon' ? radius! / .72
          : theme === 'lily' ? radius! : 1
  const depth = stage < 6 ? (theme === 'stone' ? halfZ / .9 : 1)
    : theme === 'duck' ? halfZ / .9 : width
  const part: Part = {
    p: [pad.x, pad.height, pad.z],
    r: [0, pad.yaw, 0],
    s: [width, 1, depth],
    c: pad.stoneTone === 'black' ? '#24292a' : '#ffffff',
  }
  const parts = byTheme.get(theme)
  if (parts) parts.push(part)
  else byTheme.set(theme, [part])
}

/** The review shows the existing ten-stage course at its authored rest pose. */
export default function ParkJumpCourse() {
  return <>
    <group name="ten-stage-pagoda-to-lake-course">
      {Array.from(byTheme, ([theme, parts]) => <group key={theme} name={'jump-stage-' + theme}>
        {Object.entries(art[theme]).map(([finish, geometry]) => (
          <Instances key={finish} parts={parts} shadow={false}
            material={<meshLambertMaterial vertexColors />}>
            <primitive object={geometry} attach="geometry" dispose={null} />
          </Instances>
        ))}
      </group>)}
      <mesh name="jump-course-finish" position={[JUMP_FINISH.x, JUMP_FINISH.y, JUMP_FINISH.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.75, 2, 48]} />
        <meshBasicMaterial color="#d2ad55" side={2} />
      </mesh>
    </group>
    <JumpCourseGeometry />
  </>
}
