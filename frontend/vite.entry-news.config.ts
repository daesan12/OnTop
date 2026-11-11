import {defineConfig,mergeConfig} from 'vite'
import {fileURLToPath} from 'node:url'
import base from './vite.config.ts'

// Explicit local preview only: production builds never select these API doubles.
export default defineConfig(async()=>mergeConfig(await base({mode:'entry-news-preview',command:'serve',isPreview:false}),{
 mode:'entry-news-preview',
 plugins:[{name:'entry-news-preview-api',enforce:'pre' as const,resolveId(source:string,importer?:string){
  const from=importer?.replaceAll('\\','/')??''
  if(source==='./entryNewsApi'&&from.endsWith('/announcements/EntryNewsPopup.tsx'))return fileURLToPath(new URL('./src/entry-news-preview/news.ts',import.meta.url))
  if(source==='./api'&&from.endsWith('/notifications/NotificationCenter.tsx'))return fileURLToPath(new URL('./src/entry-news-preview/inbox.ts',import.meta.url))
 }}],server:{host:'127.0.0.1',port:5274,strictPort:true},
}))
