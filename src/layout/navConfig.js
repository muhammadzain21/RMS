// ─── Section-based navigation config ─────────────────────────
// Comment out any section in `allSections` to hide it from BOTH
// the sidebar AND the Permissions page. To hide a single page,
// add `hidden: true` to that item.

export const dashboardItem = { path: '/', label: 'Dashboard', icon: '⊞', order: 1 }

const salesSection = {
  label: 'Sales',
  items: [
    { path: '/sales/new', label: 'Sell', icon: '🧾', order: 2, gated: true },
    { path: '/sales/return', label: 'Return', icon: '↩️', order: 3 },
    { path: '/sales/history', label: 'Sale history', icon: '📋', order: 4 },
    { path: '/sales/deleted', label: 'Deleted Sales', icon: '🗑️', order: 5 },
    { path: '/sales/return-history', label: 'Return history', icon: '📝', order: 6 },
    { path: '/sales/kot-history', label: 'KOT History', icon: '📄', order: 7 },
    { path: '/sales/void-history', label: 'Void History', icon: '❌', order: 8 },
    { path: '/sales/cash-opening', label: 'Cash Opening', icon: '💵', order: 9 },
    { path: '/sales/cash-handover', label: 'Cash Handover', icon: '🤝', order: 10 },
    { path: '/sales/cash-count', label: 'Manager Cash Count', icon: '🔢', order: 11 },
   // { path: '/sales/advance-booking', label: 'Advance Booking', icon: '📅', order: 12 },
    { path: '/sales/day-close', label: 'Day Close', icon: '🌙', order: 13 },
    { path: '/sales/pay-in-out', label: 'Pay In/Out', icon: '💳', order: 14 },
  ]
}

const operationsSection = {
  label: 'Operations',
  items: [
    { path: '/inventory', label: 'Inventory', icon: '📦', order: 15 },
    { path: '/supply/history', label: 'Supply', icon: '🚚', order: 16 },
    { path: '/demands', label: 'Demands', icon: '📋', order: 17 },
    { path: '/suppliers', label: 'Suppliers', icon: '🏭', order: 18 },
    { path: '/customers', label: 'Customers', icon: '👤', order: 19 },
    { path: '/tables', label: 'Tables', icon: '🪑', order: 20 },
    { path: '/menu', label: 'Menu', icon: '🍔', order: 21, end: true },
    { path: '/menu/categories', label: 'Categories', icon: '🗂️', order: 22 },
    { path: '/menu/recipes', label: 'Recipes', icon: '🧪', order: 23 },
    { path: '/sales/consumption', label: 'Consumption', icon: '📊', order: 24 },
    { path: '/riders', label: 'Riders', icon: '🏍️', order: 25 },
  ]
}

const staffSection = {
  label: 'Staff Management',
  items: [
    { path: '/staff/mark-attendance', label: 'Mark Attendance', icon: '✓', order: 26 },
    { path: '/staff/add', label: 'Add Staff', icon: '👤', order: 27 },
    { path: '/staff/daily', label: 'Daily View', icon: '📆', order: 28 },
    { path: '/staff/monthly', label: 'Monthly View', icon: '📊', order: 29 },
    { path: '/staff/settings', label: 'Staff Settings', icon: '⚙️', order: 30 },
  ]
}

const financeSection = {
  label: 'Finance',
  items: [
    { path: '/expenses/new', label: 'Expenses', icon: '💸', order: 31 },
    { path: '/profit-loss', label: 'P&L', icon: '📈', order: 32 },
    { path: '/finance/cashbook', label: 'Cashbook', icon: '💰', order: 33 },
  ]
}

const adminSection = {
  label: 'Admin',
  items: [
    { path: '/users', label: 'Users', icon: '🔐', order: 34 },
    { path: '/sidebar-permissions', label: 'Permissions', icon: '🔒', order: 35 },
    { path: '/audit', label: 'Audit', icon: '📝', order: 36 },
    { path: '/settings', label: 'Settings', icon: '⚙️', order: 37 },
    { path: '/biometric-settings', label: 'Biometric', icon: '🖐️', order: 38 },
  ]
}

// ─── Master section list ───────────────────────────────────────
// Comment out any section to hide it from sidebar + permissions
export const allSections = [
  salesSection,
  operationsSection,
   staffSection,
  financeSection,
  adminSection,
]

// ─── Flat array for permission/DB usage ─────────────────────
export const sidebarItems = [
  dashboardItem,
  ...allSections.flatMap(s => s.items.map(i => ({ ...i, section: s.label })))
]

// ─── Helpers ─────────────────────────────────────────────────

export const visibleItems = () => sidebarItems.filter(i => !i.hidden)

/** Sections for sidebar rendering */
export const navSections = () =>
  allSections
    .map(s => ({
      label: s.label,
      items: s.items
        .filter(i => !i.hidden)
        .map(i => ({ to: i.path, label: i.label, icon: i.icon || '', end: i.end, gated: i.gated }))
    }))

/** Default permission entries for new roles */
export const defaultPermissionItems = () =>
  visibleItems().map(i => ({
    path: i.path,
    label: i.label,
    visible: false,
    order: i.order,
    section: i.section,
  }))
