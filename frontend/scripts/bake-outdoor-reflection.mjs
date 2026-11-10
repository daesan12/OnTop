import {createServer} from 'vite'
import {chromium} from '@playwright/test'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const root=fileURLToPath(new URL('../',import.meta.url)),hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const server=await createServer({root,configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:5499,strictPort:true},
  plugins:[{name:'reflection-capture-page',configureServer(server){server.middlewares.use((req,res,next)=>{
    if(req.url!=='/bake.html')return next()
    res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Outdoor reflection capture</title>')
  })}}],optimizeDeps:{include:['three'],entries:[],noDiscovery:true}})
let browser
try {
  await server.listen()
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--enable-unsafe-swiftshader']})
  const page=await browser.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto('http://127.0.0.1:5499/bake.html')
  for(const textureName of ['outdoor','gacha']){
  const result=await page.evaluate(async textureName=>{
    const {bakeOutdoorReflection}=await import('/scripts/bakeOutdoorReflection.ts')
    return bakeOutdoorReflection(textureName)
  },textureName)
  if(errors.length)throw Error(errors.join('\n'))
  const {source,data,...metadata}=result
  const generator=(await readFile(path.join(root,'node_modules/three/src/extras/PMREMGenerator.js'),'utf8')).replace(/\r\n?/g,'\n')
  const threeVersion=JSON.parse(await readFile(path.join(root,'node_modules/three/package.json'),'utf8')).version
  const dataBytes=Buffer.from(new Uint16Array(data).buffer)
  const output={...metadata,threeVersion,generatorSha256:hash(generator),sourceSha256:hash(new Uint8Array(source)),
    dataSha256:hash(dataBytes),dataBase64:dataBytes.toString('base64')}
  const directory=path.join(root,'src/park-renewal/static/baked')
  await mkdir(directory,{recursive:true})
  const destination=path.join(directory,textureName+'-reflection.json')
  if(process.argv.includes('--check')){
    const current=JSON.parse(await readFile(destination,'utf8'))
    if(JSON.stringify(current)!==JSON.stringify(output))
      throw Error('Outdoor reflection GPU capture differs from the checked-in data')
  }else await writeFile(destination,JSON.stringify(output)+'\n')
  console.log(JSON.stringify({...metadata,dataBytes:data.length*2,sourceSha256:output.sourceSha256,dataSha256:output.dataSha256}))
  }
}finally {await browser?.close();await server.close()}
