import { createRoot } from 'react-dom/client'

// Explicit independent dev entry. No auth/session acquisition, WebSocket or BE calls.
if(import.meta.env.DEV&&import.meta.env.MODE==='layout-preview') {
  import('./LayoutPreview').then(({default:LayoutPreview})=>createRoot(document.getElementById('root')!).render(<LayoutPreview/>))
} else document.getElementById('root')!.textContent='배치 시안은 pnpm dev:layout 으로 실행해 주세요.'
