import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import SkewerPage from './features/skewer/SkewerPage'
import './features/skewer/skewer.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><SkewerPage /></StrictMode>,
)
