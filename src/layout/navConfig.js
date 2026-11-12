// ─── Section-based navigation config ─────────────────────────
// Comment out any section in `allSections` to hide it from BOTH
// the sidebar AND the Permissions page. To hide a single page,
// add `hidden: true` to that item.

import {
  LayoutDashboard, ShoppingCart, Undo2, History, Trash2, FileText,
  XCircle, Wallet, HandCoins, Calculator, Moon, ArrowLeftRight,
  PackageOpen, Truck, ClipboardList, Factory, Users, Armchair,
  UtensilsCrossed, FolderTree, FlaskConical, BarChart3, Bike,
  CalendarCheck, UserPlus, CalendarDays, CalendarRange, Settings,
  Receipt, TrendingUp, ShieldCheck, Lock, ScrollText,
  Fingerprint, ChefHat, Database, UserCheck, Home, ShoppingBag,
  Headphones, Inbox, Building2, PackagePlus, Package, HardDrive, Landmark,
} from 'lucide-react'

export const dashboardItem = { path: '/', label: 'Dashboard', icon: LayoutDashboard, order: 1 }

// Injected into the sidebar only for staff logins whose My Work toggle is on.
export const myWorkItem = { path: '/my', label: 'Home', icon: Home, order: 1.5, section: 'My Work' }

export const myWorkNavItems = [
  { path: '/my', label: 'Home', icon: Home, order: 1.5, section: 'My Work', end: true },
  { path: '/my/attendance', label: 'Attendance', icon: CalendarCheck, order: 1.51, section: 'My Work' },
  { path: '/my/purchases', label: 'Purchases', icon: ShoppingBag, order: 1.52, section: 'My Work' },
  { path: '/my/advances', label: 'Advances', icon: HandCoins, order: 1.53, section: 'My Work' },
  { path: '/my/earnings', label: 'Earnings', icon: TrendingUp, order: 1.54, section: 'My Work' },
  { path: '/my/salary', label: 'Salary', icon: FileText, order: 1.55, section: 'My Work' },
]

const salesSection = {
 label: 'Sales',
 items: [
 { path: '/sales/new', label: 'Sell', icon: ShoppingCart, order: 2, gated: true },
 { path: '/sales/cc-inbox', label: 'CC Inbox', icon: Inbox, order: 2.2 },
 { path: '/call-center', label: 'Call Center', icon: Headphones, order: 2.3 },
 { path: '/sales/return', label: 'Return', icon: Undo2, order: 3, end: true },
 { path: '/sales/history', label: 'Sale history', icon: History, order: 4 },
 { path: '/sales/summary', label: 'Sales Summary', icon: BarChart3, order: 4.5 },
 { path: '/sales/deleted', label: 'Deleted Sales', icon: Trash2, order: 5 },
 { path: '/sales/return-history', label: 'Return history', icon: FileText, order: 6 },
 { path: '/sales/kot-history', label: 'KOT History', icon: FileText, order: 7 },
 { path: '/sales/kds', label: 'KDS', icon: ChefHat, order: 7.5 },
 { path: '/sales/void-history', label: 'Void History', icon: XCircle, order: 8 },
  { path: '/customers', label: 'Customers', icon: Users, order: 19 },

 { path: '/sales/cash-count', label: 'Manager Cash Count', icon: Calculator, order: 11 },
 { path: '/sales/advance-booking', label: 'Advance Booking', icon: CalendarCheck, order: 12 },
 ]
}

const daySection = {
 label: 'Day',
 items: [
 { path: '/sales/cash-opening', label: 'Day Opening', icon: Wallet, order: 9 },
 { path: '/sales/pay-in-out', label: 'Pay In/Out', icon: ArrowLeftRight, order: 10 },
 { path: '/sales/my-shift', label: 'My Day', icon: ClipboardList, order: 11 },
 { path: '/sales/day-close', label: 'Day Closing', icon: Moon, order: 12 },
 ]
}

const operationsSection = {
 label: 'Operations',
 items: [
 { path: '/inventory', label: 'Branch Inventory', icon: PackageOpen, order: 15, end: true },
 { path: '/inventory/transfers-in', label: 'Branch Transfers', icon: PackagePlus, order: 15.5 },
 { path: '/supply/history', label: 'Branch Purchases', icon: Truck, order: 16 },
 { path: '/demands', label: 'Demands', icon: ClipboardList, order: 17 },
 { path: '/suppliers', label: 'Branch Suppliers', icon: Factory, order: 18 },
 { path: '/tables', label: 'Tables', icon: Armchair, order: 20 },
 { path: '/menu', label: 'Menu', icon: UtensilsCrossed, order: 21, end: true },
 { path: '/menu/categories', label: 'Categories', icon: FolderTree, order: 22 },
 { path: '/menu/recipes', label: 'Recipes', icon: FlaskConical, order: 23 },
 { path: '/sales/consumption', label: 'Consumption', icon: BarChart3, order: 24 },
 { path: '/riders', label: 'Riders', icon: Bike, order: 25 },
 ]
}

const warehouseSection = {
 label: 'Warehouse',
 items: [
 { path: '/branches', label: 'Branches', icon: Building2, order: 14.8 },
 { path: '/hq/compare', label: 'Branch Compare', icon: BarChart3, order: 14.9 },
 { path: '/warehouse/stock', label: 'Warehouse Inventory', icon: Package, order: 15.1 },
 { path: '/warehouse/suppliers', label: 'Warehouse Suppliers', icon: Factory, order: 15.2, end: true },
 { path: '/warehouse/purchase-history', label: 'Warehouse Purchases', icon: ShoppingCart, order: 15.3, end: true },
 { path: '/warehouse/demands', label: 'Branch Demands', icon: ClipboardList, order: 15.4 },
 { path: '/warehouse/transfers', label: 'Warehouse Transfers', icon: ArrowLeftRight, order: 15.5, end: true },
 { path: '/warehouse/transfer-history', label: 'Warehouse Transfer History', icon: History, order: 15.6 },
 { path: '/warehouse/finance', label: 'Warehouse Finance', icon: Landmark, order: 15.7 },
 ]
}

const staffSection = {
 label: 'Staff Management',
 items: [
 { path: '/staff/mark-attendance', label: 'Mark Attendance', icon: CalendarCheck, order: 26 },
 { path: '/staff/add', label: 'Add Staff', icon: UserPlus, order: 27 },
 { path: '/staff/daily', label: 'Daily View', icon: CalendarDays, order: 28 },
 { path: '/staff/monthly', label: 'Monthly View', icon: CalendarRange, order: 29 },
 { path: '/staff/advances', label: 'Advances', icon: HandCoins, order: 29.5 },
 { path: '/staff/payroll', label: 'Payroll', icon: Wallet, order: 29.6 },
 { path: '/staff/settings', label: 'Staff Settings', icon: Settings, order: 30 },
 ]
}

const financeSection = {
 label: 'Finance',
 items: [
 { path: '/expenses/new', label: 'Expenses', icon: Receipt, order: 31.5 },
 { path: '/profit-loss', label: 'P&L', icon: TrendingUp, order: 32 },
 ]
}

const adminSection = {
 label: 'Admin',
 items: [
 { path: '/users', label: 'Users', icon: ShieldCheck, order: 34 },
 { path: '/sidebar-permissions', label: 'Permissions', icon: Lock, order: 35 },
 { path: '/audit', label: 'Audit', icon: ScrollText, order: 36 },
 { path: '/settings', label: 'Settings', icon: Settings, order: 37 },
 { path: '/backup-security', label: 'Backup & Security', icon: HardDrive, order: 37.5 },
 { path: '/biometric-settings', label: 'Biometric', icon: Fingerprint, order: 38 },
 { path: '/data-manager', label: 'Data Manager', icon: Database, order: 39 },
 ]
}

// ─── Master section list ───────────────────────────────────────
// Comment out any section to hide it from sidebar + permissions
export const allSections = [
 salesSection,
 daySection,
 operationsSection,
 warehouseSection,
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

/**
 * NavLink without `end` treats a path as active for any longer URL that
 * starts with it — e.g. /inventory on /inventory/transfers-in, or
 * /warehouse/transfers on /warehouse/transfer-history.
 * Force exact match when another nav path shares that prefix.
 */
export function needsExactNavMatch(path, allPaths = visibleItems().map(i => i.path)) {
  const p = String(path || '')
  if (!p) return true
  return allPaths.some(other => {
    const o = String(other || '')
    return o !== p && o.startsWith(p)
  })
}

/** Sections for sidebar rendering */
export const navSections = () => {
 const allPaths = visibleItems().map(i => i.path)
 return allSections
 .map(s => ({
 label: s.label,
 items: s.items
 .filter(i => !i.hidden)
 .map(i => ({
 to: i.path,
 label: i.label,
 icon: i.icon || '',
 end: i.end === true || needsExactNavMatch(i.path, allPaths),
 gated: i.gated,
 }))
 }))
}

/** Paths added after SuperAdmin may have last saved enabledPaths — show until explicitly disabled. */
const UPGRADE_ENABLED_PATHS = [
  '/warehouse/stock',
  '/warehouse/suppliers',
  '/warehouse/purchases',
  '/warehouse/purchase-history',
  '/warehouse/demands',
  '/warehouse/transfers',
  '/warehouse/transfer-history',
  '/warehouse/finance',
  '/branches',
  '/hq/compare',
  '/sales/my-shift',
  '/sales/kds',
  '/backup-security',
]

/**
 * When SuperAdmin saved enabledPaths before new pages existed, those pages
 * would stay hidden. Merge known upgrade paths as enabled by default.
 */
export function expandEnabledPaths(enabledPaths) {
  if (!Array.isArray(enabledPaths) || enabledPaths.length === 0) return enabledPaths
  const known = new Set(visibleItems().map(i => i.path))
  const set = new Set(enabledPaths)
  let changed = false
  for (const p of UPGRADE_ENABLED_PATHS) {
    if (known.has(p) && !set.has(p)) {
      set.add(p)
      changed = true
    }
  }
  return changed ? [...set] : enabledPaths
}

/** Default permission entries for new roles */
export const defaultPermissionItems = () =>
 visibleItems().map(i => ({
 path: i.path,
 label: i.label,
 visible: false,
 order: i.order,
 section: i.section,
 }))
