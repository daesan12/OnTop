import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * 공개 추첨 기계 독립 프리뷰(공원·물리·네트워크 미사용).
 * 공원 간소화 렌더링 확인은 --mode layout-preview 로 실행한다.
 */
export default defineConfig({
  appType: 'mpa',
  cacheDir: '.vite-cache/raffle-live-preview',
  plugins: [react()],
  optimizeDeps: { entries: ['raffle-live-preview.html'] },
  server: { host: '127.0.0.1', port: 5227, strictPort: true },
})
