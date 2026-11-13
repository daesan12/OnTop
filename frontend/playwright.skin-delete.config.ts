import {defineConfig} from '@playwright/test'
import base from './playwright.skins.config'
export default defineConfig({...base,testMatch:['skin-delete.spec.ts','skin-gallery.spec.ts'],outputDir:'../output/skin-delete/browser'})
