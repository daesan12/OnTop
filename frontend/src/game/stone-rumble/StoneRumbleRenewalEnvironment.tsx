import { GARDEN_PAGODA } from '../../config'
import { PARK_LAYOUT } from '../../map/park'
import { site, heightAt } from '../../../park-renewal-preview/plan'
import { Buildings } from '../../../park-renewal-preview/Buildings'
import { ScenicDetails } from '../../../park-renewal-preview/ScenicDetails'
import { useMemo } from 'react'
import { _roots } from '@react-three/fiber'
import { snapshotParkBackground } from './snapshotParkBackground'

const pagoda = site('pagoda')
// 새 공원의 언덕 높이와 보존된 석단을 포함한다. 경기 좌표·물리는 기존 0/12/24m를 유지한다.
const arenaBaseY = heightAt(pagoda.x, pagoda.z) + PARK_LAYOUT.SITES.pagoda.floor + GARDEN_PAGODA.height + 8

export default function StoneRumbleRenewalEnvironment() {
  const background = useMemo(() => {
    // 실제 공원은 경기 중에도 마운트되어 있다. 준비된 기하/재질을 빌려
    // 두 번째 공원의 React 생성·버퍼 복사·병합을 경기 진입 때 반복하지 않는다.
    for (const [, root] of _roots) {
      const park = root.store.getState().scene.getObjectByName('park-service-map')
        ?.getObjectByName('renewal-park-surface')
      if (park) return snapshotParkBackground(park)
    }
    return null
  }, [])
  return <group name="stone-rumble-park" rotation={[0, Math.PI, 0]} userData={{ stoneParkMap: 'renewal' }}>
    <group position={[-pagoda.x, -arenaBaseY, -pagoda.z]}>
      {/* 빌린 자원은 원본 공원이 소유한다. 독립 프리뷰만 새 공원을 만든다. */}
      {background ? <primitive object={background} dispose={null} /> : <><ScenicDetails distantReady /><Buildings distantReady /></>}
    </group>
  </group>
}
