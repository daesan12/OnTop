import {defineConfig} from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
export default defineConfig({testDir:'./tests/renewal-runtime',workers:1,timeout:240000,
 outputDir:path.join(os.tmpdir(),'ontop-renewal-runtime-results'),
 use:{baseURL:'http://127.0.0.1:5390',channel:'chrome',headless:true,viewport:{width:1440,height:1000},launchOptions:{args:['--enable-webgl','--enable-unsafe-swiftshader']}},
})
