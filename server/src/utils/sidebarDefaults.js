// Shared sidebar item list — must match client src/layout/navConfig.js sidebarItems.
// New pages added here automatically appear in every role's permission list
// (merged at read time) so the Permissions page always offers the toggle.
// '/my' defaults to visible because it's a safe self-service page — untick per role to hide.

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
  { path: '/sales/void-history', label: 'Void History', visible: false, order: 8, section: 'Sales' },
  { path: '/sales/cash-opening', label: 'Cash Opening', visible: false, order: 9, section: 'Sales' },
  { path: '/sales/cash-handover', label: 'Cash Handover', visible: false, order: 10, section: 'Sales' },
  { path: '/sales/cash-count', label: 'Manager Cash Count', visible: false, order: 11, section: 'Sales' },
  { path: '/sales/advance-booking', label: 'Advance Booking', visible: false, order: 12, section: 'Sales' },
  { path: '/sales/day-close', label: 'Day Close', visible: false, order: 13, section: 'Sales' },
  { path: '/sales/pay-in-out', label: 'Pay In/Out', visible: false, order: 14, section: 'Sales' },
  // Operations
  { path: '/inventory', label: 'Branch Inventory', visible: false, order: 15, section: 'Operations' },
  { path: '/inventory/transfers-in', label: 'Transfers In', visible: false, order: 15.5, section: 'Operations' },
  { path: '/supply/history', label: 'Supply', visible: false, order: 16, section: 'Operations' },
  { path: '/demands', label: 'Demands', visible: false, order: 17, section: 'Operations' },
  { path: '/suppliers', label: 'Branch Suppliers', visible: false, order: 18, section: 'Operations' },
  { path: '/branches', label: 'Branches', visible: false, order: 14.8, section: 'Warehouse' },
  { path: '/hq/compare', label: 'Branch Compare', visible: false, order: 14.9, section: 'Warehouse' },
  { path: '/warehouse/stock', label: 'Inventory', visible: false, order: 15.1, section: 'Warehouse' },
  { path: '/warehouse/suppliers', label: 'Suppliers', visible: false, order: 15.2, section: 'Warehouse' },
  { path: '/warehouse/transfers', label: 'Transfer Stock', visible: false, order: 15.5, section: 'Warehouse' },
  { path: '/warehouse/transfer-history', label: 'Transfer History', visible: false, order: 15.6, section: 'Warehouse' },
  { path: '/customers', label: 'Customers', visible: false, order: 19, section: 'Operations' },
  { path: '/tables', label: 'Tables', visible: false, order: 20, section: 'Operations' },
  { path: '/menu', label: 'Menu', visible: false, order: 21, section: 'Operations' },
  { path: '/menu/categories', label: 'Categories', visible: false, order: 22, section: 'Operations' },
  { path: '/menu/recipes', label: 'Recipes', visible: false, order: 23, section: 'Operations' },
  { path: '/sales/consumption', label: 'Consumption', visible: false, order: 24, section: 'Operations' },
  { path: '/riders', label: 'Riders', visible: false, order: 25, section: 'Operations' },
  // Staff Management
  { path: '/staff/mark-attendance', label: 'Mark Attendance', visible: false, order: 26, section: 'Staff Management' },
  { path: '/staff/add', label: 'Add Staff', visible: false, order: 27, section: 'Staff Management' },
  { path: '/staff/daily', label: 'Daily View', visible: false, order: 28, section: 'Staff Management' },
  { path: '/staff/monthly', label: 'Monthly View', visible: false, order: 29, section: 'Staff Management' },
  { path: '/staff/advances', label: 'Advances', visible: false, order: 29.5, section: 'Staff Management' },
  { path: '/staff/payroll', label: 'Payroll', visible: false, order: 29.6, section: 'Staff Management' },
  { path: '/staff/settings', label: 'Staff Settings', visible: false, order: 30, section: 'Staff Management' },
  // Finance + Admin
  { path: '/expenses/new', label: 'Expenses', visible: false, order: 31, section: 'Finance' },
  { path: '/profit-loss', label: 'P&L', visible: false, order: 32, section: 'Finance' },
  { path: '/finance/cashbook', label: 'Cashbook', visible: false, order: 33, section: 'Finance' },
  { path: '/users', label: 'Users', visible: false, order: 34, section: 'Admin' },
  { path: '/sidebar-permissions', label: 'Permissions', visible: false, order: 35, section: 'Admin' },
  { path: '/audit', label: 'Audit', visible: false, order: 36, section: 'Admin' },
  { path: '/settings', label: 'Settings', visible: false, order: 37, section: 'Admin' },
  { path: '/biometric-settings', label: 'Biometric', visible: false, order: 38, section: 'Admin' },
  { path: '/data-manager', label: 'Data Manager', visible: false, order: 39, section: 'Admin' },
]

// Merge stored role permissions with the current defaults:
// - keeps the role's saved visible flag per path
// - appends any newly-added pages so the toggle shows up for old role docs
export function mergePermissions(permissions) {
  const list = Array.isArray(permissions) ? permissions : []
  const known = new Set(list.map(p => p?.path))
  const missing = defaultSidebarItems.filter(i => !known.has(i.path))
  return [...list, ...missing.map(i => ({ ...i }))]
    .sort((a, b) => (a.order || 0) - (b.order || 0))
}
