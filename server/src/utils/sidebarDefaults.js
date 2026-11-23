// Shared sidebar item list — must match client src/layout/navConfig.js sidebarItems.
// New pages added here automatically appear in every role's permission list
// (merged at read time) so the Permissions page always offers the toggle.

export const defaultSidebarItems = [
  { path: '/', label: 'Dashboard', visible: false, order: 1, section: 'Dashboard' },
  { path: '/my', label: 'My Work Home', visible: false, order: 1.5, section: 'My Work' },
  // Sales
  { path: '/sales/new', label: 'Sell', visible: false, order: 2, section: 'Sales' },
  { path: '/sales/cc-inbox', label: 'CC Inbox', visible: false, order: 2.2, section: 'Sales' },
  { path: '/call-center', label: 'Call Center', visible: false, order: 2.3, section: 'Sales' },
  { path: '/sales/return', label: 'Return', visible: false, order: 3, section: 'Sales' },
  { path: '/sales/history', label: 'Sale history', visible: false, order: 4, section: 'Sales' },
  { path: '/sales/deleted', label: 'Deleted Sales', visible: false, order: 5, section: 'Sales' },
  { path: '/sales/return-history', label: 'Return history', visible: false, order: 6, section: 'Sales' },
  { path: '/sales/kot-history', label: 'KOT History', visible: false, order: 7, section: 'Sales' },
  { path: '/sales/kds', label: 'KDS', visible: false, order: 7.5, section: 'Sales' },
  { path: '/sales/void-history', label: 'Void History', visible: false, order: 8, section: 'Sales' },
  { path: '/customers', label: 'Customers', visible: false, order: 19, section: 'Sales' },
  { path: '/sales/advance-booking', label: 'Advance Booking', visible: false, order: 12, section: 'Sales' },
  // Day
  { path: '/sales/cash-opening', label: 'Day Opening', visible: false, order: 9, section: 'Day' },
  { path: '/sales/pay-in-out', label: 'Pay In/Out', visible: false, order: 10, section: 'Day' },
  { path: '/sales/cash-count', label: 'Manager Cash Count', visible: false, order: 10.5, section: 'Day' },
  { path: '/sales/my-shift', label: 'My Day', visible: false, order: 11, section: 'Day' },
  { path: '/sales/day-close', label: 'Day Closing', visible: false, order: 12, section: 'Day' },
  // Operations
  { path: '/inventory', label: 'Branch Inventory', visible: false, order: 15, section: 'Operations' },
  { path: '/inventory/transfers-in', label: 'Branch Transfers', visible: false, order: 15.5, section: 'Operations' },
  { path: '/supply/history', label: 'Branch Purchases', visible: false, order: 16, section: 'Operations' },
  { path: '/demands', label: 'Demands', visible: false, order: 17, section: 'Operations' },
  { path: '/suppliers', label: 'Branch Suppliers', visible: false, order: 18, section: 'Operations' },
  { path: '/tables', label: 'Tables', visible: false, order: 20, section: 'Operations' },
  { path: '/menu', label: 'Menu', visible: false, order: 21, section: 'Operations' },
  { path: '/menu/categories', label: 'Categories', visible: false, order: 22, section: 'Operations' },
  { path: '/menu/recipes', label: 'Recipes', visible: false, order: 23, section: 'Operations' },
  { path: '/riders', label: 'Riders', visible: false, order: 25, section: 'Operations' },
  { path: '/riders/live', label: 'Rider Live Map', visible: false, order: 25.2, section: 'Operations' },
  // Warehouse
  { path: '/branches', label: 'Branches', visible: false, order: 14.8, section: 'Warehouse' },
  { path: '/hq/compare', label: 'Branch Compare', visible: false, order: 14.9, section: 'Warehouse' },
  { path: '/warehouse/stock', label: 'Warehouse Inventory', visible: false, order: 15.1, section: 'Warehouse' },
  { path: '/warehouse/suppliers', label: 'Warehouse Suppliers', visible: false, order: 15.2, section: 'Warehouse' },
  { path: '/warehouse/purchase-history', label: 'Warehouse Purchases', visible: false, order: 15.3, section: 'Warehouse' },
  { path: '/warehouse/demands', label: 'Branch Demands', visible: false, order: 15.4, section: 'Warehouse' },
  { path: '/warehouse/transfers', label: 'Warehouse Transfers', visible: false, order: 15.5, section: 'Warehouse' },
  { path: '/warehouse/transfer-history', label: 'Warehouse Transfer History', visible: false, order: 15.6, section: 'Warehouse' },
  { path: '/warehouse/finance', label: 'Warehouse Finance', visible: false, order: 15.7, section: 'Warehouse' },
  // Staff Management
  { path: '/staff/mark-attendance', label: 'Mark Attendance', visible: false, order: 26, section: 'Staff Management' },
  { path: '/staff/add', label: 'Add Staff', visible: false, order: 27, section: 'Staff Management' },
  { path: '/staff/daily', label: 'Daily View', visible: false, order: 28, section: 'Staff Management' },
  { path: '/staff/monthly', label: 'Monthly View', visible: false, order: 29, section: 'Staff Management' },
  { path: '/staff/advances', label: 'Advances', visible: false, order: 29.5, section: 'Staff Management' },
  { path: '/staff/payroll', label: 'Payroll', visible: false, order: 29.6, section: 'Staff Management' },
  { path: '/staff/settings', label: 'Staff Settings', visible: false, order: 30, section: 'Staff Management' },
  // Reports
  { path: '/reports/sales', label: 'Sales Reports', visible: false, order: 30.1, section: 'Reports' },
  { path: '/reports/inventory', label: 'Inventory Reports', visible: false, order: 30.2, section: 'Reports' },
  { path: '/reports/consumption', label: 'Consumption Reports', visible: false, order: 30.3, section: 'Reports' },
  // Finance
  { path: '/expenses/new', label: 'Expenses', visible: false, order: 31.5, section: 'Finance' },
  { path: '/profit-loss', label: 'P&L', visible: false, order: 32, section: 'Finance' },
  // Admin
  { path: '/users', label: 'Users', visible: false, order: 34, section: 'Admin' },
  { path: '/sidebar-permissions', label: 'Permissions', visible: false, order: 35, section: 'Admin' },
  { path: '/audit', label: 'Audit', visible: false, order: 36, section: 'Admin' },
  { path: '/settings', label: 'Settings', visible: false, order: 37, section: 'Admin' },
  { path: '/printers', label: 'Printers', visible: false, order: 37.25, section: 'Admin' },
  { path: '/cloud-sync', label: 'Cloud Sync', visible: false, order: 37.35, section: 'Admin' },
  { path: '/backup-security', label: 'Backup & Security', visible: false, order: 37.5, section: 'Admin' },
  { path: '/biometric-settings', label: 'Biometric', visible: false, order: 38, section: 'Admin' },
  { path: '/data-manager', label: 'Data Manager', visible: false, order: 39, section: 'Admin' },
]

/** Normalize mongoose subdocs / lean objects into plain permission rows. */
function plainPerm(p) {
  if (!p) return null
  const src = typeof p.toObject === 'function' ? p.toObject() : p
  const path = String(src.path || p.path || '')
  if (!path) return null
  return {
    path,
    label: String(src.label || p.label || path),
    visible: !!(src.visible ?? p.visible),
    order: Number(src.order ?? p.order ?? 99) || 99,
    section: String(src.section || p.section || ''),
  }
}

// Merge stored role/user permissions with the current defaults:
// - keeps the saved visible flag per path
// - appends any newly-added pages so the toggle shows up for old docs
export function mergePermissions(permissions) {
  const list = Array.isArray(permissions) ? permissions : []
  const byPath = new Map()
  for (const p of list) {
    const plain = plainPerm(p)
    if (!plain) continue
    byPath.set(plain.path, plain)
  }
  for (const i of defaultSidebarItems) {
    if (!byPath.has(i.path)) byPath.set(i.path, { ...i })
  }
  return [...byPath.values()].sort((a, b) => (a.order || 0) - (b.order || 0))
}
