export const adminRoutes = {
  home: { path: '/admin', page: 'admin' },
  operations: { path: '/admin/operations', page: 'admin-operations' },
  announcements: { path: '/admin/announcements', page: 'admin-announcements' },
  events: { path: '/admin/events', page: 'admin-events' },
  feedback: { path: '/admin/feedback', page: 'admin-feedback' },
  analytics: { path: '/admin/analytics', page: 'admin-analytics' },
  'wallet-grants': { path: '/admin/wallet-grants', page: 'admin-wallet-grants' },
} as const

export type AdminSection = keyof typeof adminRoutes
export type AdminPage = (typeof adminRoutes)[AdminSection]['page']

const sections = Object.keys(adminRoutes) as AdminSection[]

export function adminSectionForPath(path: string): AdminSection | null {
  return sections.find(section => adminRoutes[section].path === path) ?? null
}

export function adminSectionForPage(page: string): AdminSection | null {
  return sections.find(section => adminRoutes[section].page === page) ?? null
}
