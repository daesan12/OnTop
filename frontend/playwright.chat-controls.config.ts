import { defineConfig } from '@playwright/test'
import base from './playwright.world-typing.config'
export default defineConfig({ ...base, testMatch: ['**/chat-controls.spec.ts', '**/game-spectator-policy.spec.ts', '**/world-typing.spec.ts', '**/emote-keyboard.spec.ts'] })
