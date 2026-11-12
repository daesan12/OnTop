import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {fileURLToPath} from 'node:url'
import {parkBindingsPlugin} from './scripts/parkBindingsPlugin.ts'
import {parkGeometryPlugin} from './scripts/parkGeometryPlugin.ts'
// This isolated UI fixture uses the real stores and components without acquiring a live account.
export default defineConfig({plugins:[react(),parkBindingsPlugin(),parkGeometryPlugin()],resolve:{alias:[{
 find:/^(?:\.\.\/)+park\/runtime\/ParkRuntime$/,
 replacement:fileURLToPath(new URL('./tests/fixtures/npc-runtime.ts',import.meta.url)),
}]}})
