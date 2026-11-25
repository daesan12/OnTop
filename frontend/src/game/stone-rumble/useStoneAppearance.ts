import { useEffect, useMemo, useState } from 'react'
import { useLoader } from '@react-three/fiber'
import { useSession } from '../../network/worldClient'
import { emptyEquipment } from '../../network/equipment'
import { WARDROBE_OUTFITS_ENABLED } from '../../features/wardrobe/feature'
import { ParkAssetLoader } from '../../world/art/assetLoader'
import { characterUrls } from '../../world/art/CharacterRig'
import { isCharacterSource, lookSources, resolveLook } from '../../world/art/characterLook'
import { useOutfitSources } from '../../world/art/outfitSources'
import { resolveWholeSkin } from '../../world/art/wholeSkin'
import { useSkinCatalog } from '../../world/art/skinCatalog'

/** 공원과 같은 공개 착용 정보와 파일 캐시를 구독한다. 아직 안 온 의상을 기본복으로 확정하지 않는다. */
export function useStoneAppearance(userId: string, index: number, localOnly: boolean) {
  const base = useLoader(ParkAssetLoader, characterUrls)
  const character = useSession(s => s.profiles[userId]?.character)
  const received = useSession(s => s.equipment[userId])
  const variant = character === 'girl' || !character && localOnly && index % 2 === 1 ? 'girl' : 'man'
  const worn = WARDROBE_OUTFITS_ENABLED ? received ?? emptyEquipment : emptyEquipment
  const revision = useSkinCatalog(s => s.revision)
  const checked = useSkinCatalog(s => s.checked)
  const waitingForCatalog = !checked && worn.some(item => item.imageKey?.startsWith('catalog/'))
  const look = useMemo(() => resolveLook(variant, worn), [variant, worn, revision])
  const wholeSkin = resolveWholeSkin(variant, worn)
  const names = wholeSkin ? [wholeSkin.source] : lookSources(look).filter(name => !isCharacterSource(name))
  const { outfits, pending } = useOutfitSources(names)
  const [timedOut, setTimedOut] = useState(false)
  useEffect(() => {
    setTimedOut(false)
    if (localOnly || !WARDROBE_OUTFITS_ENABLED || received !== undefined) return
    const timeout = window.setTimeout(() => setTimedOut(true), 8000)
    return () => window.clearTimeout(timeout)
  }, [userId, localOnly, received])
  const ready = (localOnly || !WARDROBE_OUTFITS_ENABLED || received !== undefined || timedOut)
    && !waitingForCatalog && !pending
  const files = useMemo(() => new Map([['man', base[0]!], ['girl', base[1]!], ...outfits]), [base, outfits])
  if (ready && names.some(name => !outfits.has(name))) {
    throw new Error('현재 착용한 스킨을 불러오지 못했어요. 연결을 확인하고 다시 준비해 주세요.')
  }
  return { ready, source: files.get(variant)!, files, look, whole: wholeSkin && files.get(wholeSkin.source),
    metadata: { character: variant, equipment: worn, wholeSkin: wholeSkin?.imageKey } }
}
