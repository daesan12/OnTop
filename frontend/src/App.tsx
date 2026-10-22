import { AuthCallbackPage } from './auth/AuthCallbackPage'
import { LoginPage } from './login/LoginPage'

export default function App() {
  return window.location.pathname === '/auth/callback' ? <AuthCallbackPage /> : <LoginPage />
}
