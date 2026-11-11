import {afterEach,expect,it,vi} from 'vitest'
import {CubeUVReflectionMapping,EquirectangularReflectionMapping,HalfFloatType,LinearFilter,LinearSRGBColorSpace} from 'three'
import captured from '../../src/park-renewal/static/baked/outdoor-reflection.json'
import {validateOutdoorReflection} from '../../scripts/validateOutdoorReflection'

afterEach(()=>vi.restoreAllMocks())

it('필터 데이터는 현재 Three 생성기·원본 반사광과 일치하고 손상된 픽셀을 거부한다',async()=>{
  await expect(validateOutdoorReflection(process.cwd())).resolves.toBeUndefined()
  const original=captured.dataBase64
  try {
    captured.dataBase64=(original[0]==='A'?'B':'A')+original.slice(1)
    await expect(validateOutdoorReflection(process.cwd())).rejects.toThrow('bake is stale')
  }finally{captured.dataBase64=original}
})

it('부트스트랩 전에 설치한 HalfFloat 픽셀과 필터·색공간·방향을 그대로 복원한다',async()=>{
  vi.resetModules()
  const {installOutdoorReflectionData,getOutdoorReflectionData}=await import('../../src/world/art/outdoorReflectionData')
  const {createOutdoorReflectionSnapshot}=await import('../../src/park-renewal/static/outdoorReflectionSnapshot')
  const snapshot=createOutdoorReflectionSnapshot()
  installOutdoorReflectionData(snapshot)
  const {outdoorReflectionMap:texture}=await import('../../src/world/art/ornamentTextures')
  expect(texture.image.data).toBe(snapshot.data)
  expect(texture.image.width).toBe(captured.width);expect(texture.image.height).toBe(captured.height)
  expect(texture.mapping).toBe(CubeUVReflectionMapping);expect(texture.type).toBe(HalfFloatType)
  expect(texture.colorSpace).toBe(LinearSRGBColorSpace)
  expect(texture.minFilter).toBe(LinearFilter);expect(texture.magFilter).toBe(LinearFilter)
  expect(texture.flipY).toBe(false);expect(texture.generateMipmaps).toBe(false)
  expect(performance.getEntriesByName('park-static-reflection-ready').length).toBeGreaterThan(0)
  expect(()=>installOutdoorReflectionData({...snapshot,data:new Uint16Array(3)})).toThrow('reflection data')
  expect(getOutdoorReflectionData()).toBe(snapshot)
  installOutdoorReflectionData(undefined);texture.dispose()
})

it('사전 데이터가 없는 개발·이전 파일 경로는 기존 반사광 원본을 유지한다',async()=>{
  vi.resetModules()
  const {outdoorReflectionMap,outdoorReflection}=await import('../../src/world/art/ornamentTextures')
  const source=outdoorReflection()
  expect(outdoorReflectionMap.mapping).toBe(EquirectangularReflectionMapping)
  expect(outdoorReflectionMap.image.data).toEqual(source.image.data)
  source.dispose();outdoorReflectionMap.dispose()
})

it('뽑기 반사광을 독립적으로 복원하며 두 반사광 중 하나가 손상되면 설치하지 않는다',async()=>{
  vi.resetModules()
  const {installReflectionData,getOutdoorReflectionData,getGachaReflectionData}=await import('../../src/world/art/outdoorReflectionData')
  const {createOutdoorReflectionSnapshot,createGachaReflectionSnapshot}=await import('../../src/park-renewal/static/outdoorReflectionSnapshot')
  const outdoor=createOutdoorReflectionSnapshot(),gacha=createGachaReflectionSnapshot()
  installReflectionData({outdoor,gacha})
  const {gachaMaterials}=await import('../../src/features/gacha/parkAsset/gachaMaterials')
  expect(gachaMaterials.gold.envMap!.mapping).toBe(CubeUVReflectionMapping)
  const image=gachaMaterials.gold.envMap!.image as {data:Uint16Array}
  expect(image.data).toBe(gacha.data)
  expect(image.data).not.toBe(outdoor.data)
  expect(()=>installReflectionData({outdoor:{...outdoor},gacha:{...gacha,data:new Uint16Array(1)}})).toThrow('reflection data')
  expect(getOutdoorReflectionData()).toBe(outdoor);expect(getGachaReflectionData()).toBe(gacha)
  installReflectionData({})
})
