import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
// Test-only authenticated principal fixture. This configuration is never used by a production build.
const port=Number(process.env.PARK_JAVA_PORT)
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PARK_JAVA_PORT is required')
export default defineConfig({plugins:[react()],server:{proxy:{'/ws/tables':{
  target:`http://127.0.0.1:${port}`,ws:true,headers:{'X-Test-Login':'naver'},rewrite:path=>path.split('?')[0]!,
}}}})
