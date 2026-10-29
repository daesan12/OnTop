import { preloadAuthSession } from './auth/authFlow'

// Start the existing single-flight refresh before downloading/evaluating React
// and Three. OAuth callback exchange owns its own credentials and must not race
// a refresh of the previous session. App reuses this same in-memory request.
if (window.location.pathname !== '/auth/callback') preloadAuthSession()
void import('./main')
