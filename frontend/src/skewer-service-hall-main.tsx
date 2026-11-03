import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ServiceHallPage from './features/skewer/serviceHall/ServiceHallPage'
createRoot(document.getElementById('root')!).render(<StrictMode><ServiceHallPage /></StrictMode>)
