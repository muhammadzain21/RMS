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
 { path: '/sales/return', label: 'Return', icon: Undo2, order: 3 },
 { path: '/sales/history', label: 'Sale history', icon: History, order: 4 },
 { path: '/sales/deleted', label: 'Deleted Sales', icon: Trash2, order: 5 },
 { path: '/sales/return-history', label: 'Return history', icon: FileText, order: 6 },
 { path: '/sales/kot-history', label: 'KOT History', icon: FileText, order: 7 },
 { path: '/sales/kds', label: 'KDS', icon: ChefHat, order: 7.5 },
 { path: '/sales/void-history', label: 'Void History', icon: XCircle, order: 8 },
 { path: '/sales/cash-opening', label: 'Day Opening', icon: Wallet, order: 9 },
  { path: '/customers', label: 'Customers', icon: Users, order: 19 },

 { path: '/sales/cash-count', label: 'Manager Cash Count', icon: Calculator, order: 11 },
 { path: '/sales/advance-booking', label: 'Advance Booking', icon: CalendarCheck, order: 12 },
 { path: '/sales/day-close', label: 'Day Close', icon: Moon, order: 13 },
 { path: '/sales/pay-in-out', label: 'Pay In/Out', icon: ArrowLeftRight, order: 14 },
 ]
}

const operationsSection = {
 label: 'Operations',
 items: [
 { path: '/inventory', label: 'Inventory', icon: PackageOpen, order: 15 },
 { path: '/supply/history', label: 'Purchase History', icon: Truck, order: 16 },
 { path: '/demands', label: 'Demands', icon: ClipboardList, order: 17 },
 { path: '/suppliers', label: 'Suppliers', icon: Factory, order: 18 },
 { path: '/tables', label: 'Tables', icon: Armchair, order: 20 },
 { path: '/menu', label: 'Menu', icon: UtensilsCrossed, order: 21, end: true },
 { path: '/menu/categories', label: 'Categories', icon: FolderTree, order: 22 },
 { path: '/menu/recipes', label: 'Recipes', icon: FlaskConical, order: 23 },
 { path: '/sales/consumption', label: 'Consumption', icon: BarChart3, order: 24 },
 { path: '/riders', label: 'Riders', icon: Bike, order: 25 },
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
 { path: '/expenses/new', label: 'Expenses', icon: Receipt, order: 31 },
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
 { path: '/biometric-settings', label: 'Biometric', icon: Fingerprint, order: 38 },
 { path: '/data-manager', label: 'Data Manager', icon: Database, order: 39 },
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
