export type UserRole = 'admin' | 'director' | 'foreman'

export interface MenuItem {
  label: string // Translation key (e.g., 'nav.projects')
  path: string
  icon?: string
  roles: UserRole[]
}

export const SIDEBAR_MENU_ITEMS: MenuItem[] = [
  // Director/Admin/Foreman menu items
  {
    label: 'nav.planPeriods',
    path: '/plan-setup',
    icon: '🗓️',
    roles: ['admin', 'director', 'foreman'],
  },
  {
    label: 'nav.financePeriods',
    path: '/finance-periods',
    icon: '📅',
    roles: ['admin', 'director'],
  },
  {
    label: 'nav.expenses',
    path: '/expenses',
    roles: ['admin', 'director'],
    icon: '💸',
  },
  {
    label: 'nav.reports',
    path: '/reports',
    icon: '📊',
    roles: ['admin', 'director', 'foreman'],
  },
  // Admin-only menu items
  {
    label: 'nav.admin',
    path: '/admin',
    icon: '🛠️',
    roles: ['admin'],
  },
  {
    label: 'categories.title',
    path: '/admin/categories',
    roles: ['admin'],
    icon: '🗂️',
  },
  {
    label: 'nav.incomeSources',
    path: '/admin/income-sources',
    roles: ['admin'],
    icon: '💰',
  },
]

/**
 * Get menu items filtered by user role
 */
export function getMenuItemsByRole(role: UserRole | null | undefined): MenuItem[] {
  if (!role) {
    return []
  }
  return SIDEBAR_MENU_ITEMS.filter((item) => item.roles.includes(role))
}


