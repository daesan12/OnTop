import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ChefPage from './features/skewer/chef/ChefPage'
createRoot(document.getElementById('root')!).render(<StrictMode><ChefPage /></StrictMode>)
