import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { adminRoutes } from '../../src/features/admin/adminRoutes'

describe('관리자 화면 배포 진입 경로', () => {
  it.each(['vercel.dev.json', 'vercel.json'])('%s에서 직접 접속·새로고침을 지원한다', file => {
    const config = JSON.parse(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'))
    for (const { path } of Object.values(adminRoutes)) {
      expect(config.rewrites, `${file}: ${path}`).toContainEqual({ source: path, destination: '/index.html' })
    }
  })
})
