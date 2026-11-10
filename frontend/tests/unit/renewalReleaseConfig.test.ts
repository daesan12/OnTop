import {afterEach,expect,it,vi} from 'vitest'
import release from '../../vite.renewal-release.config'

afterEach(()=>vi.unstubAllEnvs())
const configuration=async()=>{
 if(typeof release!=='function')throw new Error('Expected renewal release configuration factory')
 return await release({command:'build',mode:'park-renewal-release',isSsrBuild:false,isPreview:false})
}

it('새 공원 단독 빌드도 dev에서 제공하는 알까기와 협동 꼬치왕을 포함한다',async()=>{
 for(const name of ['VITE_ALKKAGI_ENABLED','VITE_WARDROBE_OUTFITS','VITE_SKEWER_COOP_ENABLED'])vi.stubEnv(name,undefined)
 const config=await configuration()
 expect(config.define?.['import.meta.env.VITE_ALKKAGI_ENABLED']).toBe('"true"')
 expect(config.define?.['import.meta.env.VITE_SKEWER_COOP_ENABLED']).toBe('"true"')
})

it('담당자가 명시한 게임 비활성화 설정은 새 공원 기본값보다 우선한다',async()=>{
 vi.stubEnv('VITE_ALKKAGI_ENABLED','false')
 vi.stubEnv('VITE_SKEWER_COOP_ENABLED','false')
 const config=await configuration()
 expect(config.define?.['import.meta.env.VITE_ALKKAGI_ENABLED']).toBe('"false"')
 expect(config.define?.['import.meta.env.VITE_SKEWER_COOP_ENABLED']).toBe('"false"')
})
