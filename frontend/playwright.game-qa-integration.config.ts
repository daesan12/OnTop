import { defineConfig } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
import base from './playwright.park.config'

// 최신 생성 맵에서 이 채팅의 작업을 함께 검증한다. HTTP/WS fixture 사용, 실제 DB·지급 없음.
// node node_modules/@playwright/test/cli.js test --config playwright.game-qa-integration.config.ts
export default defineConfig({
  ...base,
  testDir:'./tests',
  outputDir:path.join(os.tmpdir(),'ontop-game-qa-integration'),
  use:{...base.use,baseURL:'http://127.0.0.1:5296'},
  projects:[
    {name:'games-and-park-qa',metadata:{generatedPark:true},testMatch:[
      '**/park-integration/onecard-hud-qa.spec.ts','**/park-integration/onecard-qa.spec.ts','**/park-integration/omok-board-qa.spec.ts',
      '**/park-integration/jumpmap-guide.spec.ts','**/park-integration/jumpmap.spec.ts','**/park-integration/notes-live.spec.ts',
      '**/park-integration/emote-feedback.spec.ts','**/park-integration/pavilion-assets.spec.ts','**/e2e/browser-shortcuts.spec.ts',
    ]},
    {name:'park-entry-regression',metadata:{generatedPark:true},testMatch:'**/park-feedback-v3.spec.ts',
      grep:/latest park has a visible VR start marker|bungeoppang entry fits|the ready sheet leads/},
  ],
  webServer:{command:'node node_modules/vite/bin/vite.js --mode park-integration --host 127.0.0.1 --port 5296 --strictPort',
    env:{VITE_BROWSER_SHORTCUT_GUARD:'true'},
    url:'http://127.0.0.1:5296',reuseExistingServer:false},
})
