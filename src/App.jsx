import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/layout/Layout.jsx'
import Dashboard from '@features/dashboard/pages/Dashboard.jsx'
import InventoryList from '@features/inventory/pages/InventoryList.jsx'
import InventoryForm from '@features/inventory/pages/InventoryForm.jsx'
import PhysicalStock from '@features/inventory/pages/PhysicalStock.jsx'
import SalesNew from '@features/sales/pages/SalesNew.jsx'
import SalesHistory from '@features/sales/pages/SalesHistory.jsx'
import DeletedSales from '@features/sales/pages/DeletedSales.jsx'
import SalesReports from '@features/reports/pages/SalesReports.jsx'
import InventoryReports from '@features/reports/pages/InventoryReports.jsx'
import ConsumptionReports from '@features/reports/pages/ConsumptionReports.jsx'
import ReturnNew from '@features/sales/pages/ReturnNew.jsx'
import ReturnHistory from '@features/sales/pages/ReturnHistory.jsx'
import CashOpening from '@features/day/pages/CashOpening.jsx'
import CashCount from '@features/day/pages/CashCount.jsx'
import AdvanceBooking from '@features/sales/pages/AdvanceBooking.jsx'
import DayClose from '@features/day/pages/DayClose.jsx'
import DataManager from '@features/admin/pages/DataManager.jsx'
import PayInOut from '@features/day/pages/PayInOut.jsx'
import MyShift from '@features/day/pages/MyShift.jsx'
import KotHistory from '@features/sales/pages/KotHistory.jsx'
import KDS from '@features/sales/pages/KDS.jsx'
import VoidHistory from '@features/sales/pages/VoidHistory.jsx'
import SupplyNew from '@features/suppliers/pages/SupplyNew.jsx'
import SupplyHistory from '@features/suppliers/pages/SupplyHistory.jsx'
import DemandList from '@features/inventory/pages/DemandList.jsx'
import StaffAttendance from '@features/staff/pages/StaffAttendance.jsx'
import MyWorkLayout from '@features/my-work/components/MyWorkShared.jsx'
import MyHome from '@features/my-work/pages/MyHome.jsx'
import MyAttendance from '@features/my-work/pages/MyAttendance.jsx'
import MyPurchases from '@features/my-work/pages/MyPurchases.jsx'
import MyAdvances from '@features/my-work/pages/MyAdvances.jsx'
import MyEarnings from '@features/my-work/pages/MyEarnings.jsx'
import MySalary from '@features/my-work/pages/MySalary.jsx'
import MyRider from '@features/my-work/pages/MyRider.jsx'
import ExpenseNew from '@features/expenses/pages/ExpenseNew.jsx'
import ExpenseHistory from '@features/expenses/pages/ExpenseHistory.jsx'
import RiderList from '@features/riders/pages/RiderList.jsx'
import RiderAssign from '@features/riders/pages/RiderAssign.jsx'
import RiderDaily from '@features/riders/pages/RiderDaily.jsx'
import RiderLiveMap from '@features/riders/pages/RiderLiveMap.jsx'
import ProfitLoss from '@features/dashboard/pages/ProfitLoss.jsx'
import Settings from '@features/admin/pages/Settings.jsx'
import PrinterSettings from '@features/admin/pages/PrinterSettings.jsx'
import CloudSyncSettings from '@features/admin/pages/CloudSyncSettings.jsx'
import BackupSecurity from '@features/admin/pages/BackupSecurity.jsx'
import BiometricSettings from '@features/admin/pages/BiometricSettings.jsx'
import AuditLog from '@features/admin/pages/AuditLog.jsx'
import UserList from '@features/admin/pages/UserList.jsx'
import SidebarPermissions from '@features/admin/pages/SidebarPermissions.jsx'
import Login from '@features/admin/pages/Login.jsx'
import ServerConfig from '@features/admin/pages/ServerConfig.jsx'
import ProtectedRoute from '@shared/components/ProtectedRoute.jsx'
import SuperAdminPortal from '@shared/components/SuperAdminPortal.jsx'
import LicenseGate from '@shared/components/LicenseGate.jsx'
import { useState, useEffect } from 'react'
import SupplierList from '@features/suppliers/pages/SupplierList.jsx'
import SupplierProfile from '@features/suppliers/pages/SupplierProfile.jsx'
import CustomerList from '@features/customers/pages/CustomerList.jsx'
import CustomerProfile from '@features/customers/pages/CustomerProfile.jsx'
import Tables from '@features/tables/pages/Tables.jsx'
import MenuList from '@features/menu/pages/MenuList.jsx'
import Categories from '@features/menu/pages/Categories.jsx'
import Recipes from '@features/menu/pages/Recipes.jsx'
import BranchesAdmin from '@features/warehouse/pages/BranchesAdmin.jsx'
import CallCenterOrders from '@features/warehouse/pages/CallCenterOrders.jsx'
import HqCompare from '@features/warehouse/pages/HqCompare.jsx'
import CallCenterInbox from '@features/sales/pages/CallCenterInbox.jsx'
import TransferInbox from '@features/inventory/pages/TransferInbox.jsx'
import SyncBootstrap from '@shared/components/SyncBootstrap.jsx'
import WarehouseStock from '@features/warehouse/pages/WarehouseStock.jsx'
import WarehouseSuppliers from '@features/warehouse/pages/WarehouseSuppliers.jsx'
import WarehouseSupplierHistory from '@features/warehouse/pages/WarehouseSupplierHistory.jsx'
import WarehouseTransfers from '@features/warehouse/pages/WarehouseTransfers.jsx'
import WarehouseTransferHistory from '@features/warehouse/pages/WarehouseTransferHistory.jsx'
import WarehouseFinance from '@features/warehouse/pages/WarehouseFinance.jsx'
import WarehouseDemands from '@features/warehouse/pages/WarehouseDemands.jsx'
import WarehousePurchases from '@features/warehouse/pages/WarehousePurchases.jsx'

function App() {
  const isCapacitor = typeof window !== 'undefined' && !!(window.Capacitor || /Capacitor/i.test(navigator.userAgent))
  const [serverReady, setServerReady] = useState(() => {
    if (!isCapacitor) return true
    try { return !!localStorage.getItem('server_url') } catch { return false }
  })

  // Listen for server_url changes (same-tab + cross-tab)
  useEffect(() => {
    const handler = () => {
      try { setServerReady(!!localStorage.getItem('server_url')) } catch {}
    }
    window.addEventListener('storage', handler)
    window.addEventListener('server_url_changed', handler)
    return () => {
      window.removeEventListener('storage', handler)
      window.removeEventListener('server_url_changed', handler)
    }
  }, [])

  // On Capacitor with no server URL configured, show the server config screen
  if (isCapacitor && !serverReady) {
    return (
      <ServerConfig
        onSaved={() => {
          setServerReady(true)
          window.dispatchEvent(new CustomEvent('server_url_changed'))
        }}
      />
    )
  }

  return (
    <>
    <SuperAdminPortal />
    <LicenseGate />
    <SyncBootstrap />
    <Routes>
      <Route path="/server-config" element={<ServerConfig onSaved={() => setServerReady(true)} />} />
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route index element={<ProtectedRoute roles={["Admin","Manager"]}><Dashboard /></ProtectedRoute>} />
        <Route path="my" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><MyWorkLayout /></ProtectedRoute>}>
          <Route index element={<MyHome />} />
          <Route path="attendance" element={<MyAttendance />} />
          <Route path="purchases" element={<MyPurchases />} />
          <Route path="advances" element={<MyAdvances />} />
          <Route path="earnings" element={<MyEarnings />} />
          <Route path="salary" element={<MySalary />} />
        </Route>
        {/* Rider PWA page — install on phone; share GPS after depart */}
        <Route path="rider" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><MyRider /></ProtectedRoute>} />

        <Route path="inventory" element={<ProtectedRoute roles={["Admin","Manager"]}><InventoryList /></ProtectedRoute>} />
        <Route path="inventory/new" element={<ProtectedRoute roles={["Admin","Manager"]}><InventoryForm /></ProtectedRoute>} />
        <Route path="inventory/physical-stock" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><PhysicalStock /></ProtectedRoute>} />
        <Route path="inventory/transfers-in" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><TransferInbox /></ProtectedRoute>} />
        <Route path="inventory/:id" element={<ProtectedRoute roles={["Admin","Manager"]}><InventoryForm /></ProtectedRoute>} />
        <Route path="warehouse" element={<Navigate to="/warehouse/stock" replace />} />
        <Route path="warehouse/stock" element={<ProtectedRoute roles={["Admin","Manager"]}><WarehouseStock /></ProtectedRoute>} />
        <Route path="warehouse/suppliers" element={<ProtectedRoute roles={["Admin","Manager"]}><WarehouseSuppliers /></ProtectedRoute>} />
        <Route path="warehouse/suppliers/:id/history" element={<ProtectedRoute roles={["Admin","Manager"]}><WarehouseSupplierHistory /></ProtectedRoute>} />
        <Route path="warehouse/purchase-history" element={<ProtectedRoute roles={["Admin","Manager"]}><WarehousePurchases /></ProtectedRoute>} />
        <Route path="warehouse/purchases" element={<Navigate to="/warehouse/purchase-history" replace />} />
        <Route path="warehouse/payments" element={<Navigate to="/warehouse/suppliers" replace />} />
        <Route path="warehouse/demands" element={<ProtectedRoute roles={["Admin","Manager"]}><WarehouseDemands /></ProtectedRoute>} />
        <Route path="warehouse/transfers" element={<ProtectedRoute roles={["Admin","Manager"]}><WarehouseTransfers /></ProtectedRoute>} />
        <Route path="warehouse/transfer-history" element={<ProtectedRoute roles={["Admin","Manager"]}><WarehouseTransferHistory /></ProtectedRoute>} />
        <Route path="warehouse/finance" element={<ProtectedRoute roles={["Admin","Manager"]}><WarehouseFinance /></ProtectedRoute>} />
        <Route path="branches" element={<ProtectedRoute roles={["Admin"]}><BranchesAdmin /></ProtectedRoute>} />
        <Route path="hq/compare" element={<ProtectedRoute roles={["Admin","Manager"]}><HqCompare /></ProtectedRoute>} />

        <Route path="sales/new" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><SalesNew /></ProtectedRoute>} />
        <Route path="sales/cc-inbox" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><CallCenterInbox /></ProtectedRoute>} />
        <Route path="call-center" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><CallCenterOrders /></ProtectedRoute>} />
        <Route path="sales/return" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><ReturnNew /></ProtectedRoute>} />
        <Route path="sales/history" element={<ProtectedRoute roles={["Admin","Manager"]}><SalesHistory /></ProtectedRoute>} />
        <Route path="sales/deleted" element={<ProtectedRoute roles={["Admin"]}><DeletedSales /></ProtectedRoute>} />
        <Route path="sales/return-history" element={<ProtectedRoute roles={["Admin","Manager"]}><ReturnHistory /></ProtectedRoute>} />
        <Route path="sales/summary" element={<Navigate to="/reports/sales" replace />} />
        <Route path="sales/consumption" element={<Navigate to="/inventory/physical-stock" replace />} />
        <Route path="reports/sales" element={<ProtectedRoute roles={["Admin","Manager"]}><SalesReports /></ProtectedRoute>} />
        <Route path="reports/inventory" element={<ProtectedRoute roles={["Admin","Manager"]}><InventoryReports /></ProtectedRoute>} />
        <Route path="reports/consumption" element={<ProtectedRoute roles={["Admin","Manager"]}><ConsumptionReports /></ProtectedRoute>} />
        <Route path="sales/kot-history" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><KotHistory /></ProtectedRoute>} />
        <Route path="sales/kds" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><KDS /></ProtectedRoute>} />
        <Route path="sales/void-history" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><VoidHistory /></ProtectedRoute>} />
        <Route path="sales/cash-opening" element={<ProtectedRoute roles={["Admin","Manager"]}><CashOpening /></ProtectedRoute>} />
        <Route path="sales/cash-count" element={<ProtectedRoute roles={["Admin","Manager"]}><CashCount /></ProtectedRoute>} />
        <Route path="sales/advance-booking" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><AdvanceBooking /></ProtectedRoute>} />
        <Route path="sales/day-close" element={<ProtectedRoute roles={["Admin","Manager"]}><DayClose /></ProtectedRoute>} />
        <Route path="data-manager" element={<ProtectedRoute roles={["Admin"]}><DataManager /></ProtectedRoute>} />
        <Route path="sales/pay-in-out" element={<ProtectedRoute roles={["Admin","Manager"]}><PayInOut /></ProtectedRoute>} />
        <Route path="sales/my-shift" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><MyShift /></ProtectedRoute>} />

        <Route path="supply/new" element={<ProtectedRoute roles={["Admin","Manager"]}><SupplyNew /></ProtectedRoute>} />
        <Route path="supply/history" element={<ProtectedRoute roles={["Admin","Manager"]}><SupplyHistory /></ProtectedRoute>} />
        <Route path="demands" element={<ProtectedRoute roles={["Admin","Manager"]}><DemandList /></ProtectedRoute>} />

        <Route path="suppliers" element={<ProtectedRoute roles={["Admin","Manager"]}><SupplierList /></ProtectedRoute>} />
        <Route path="suppliers/:id" element={<ProtectedRoute roles={["Admin","Manager"]}><SupplierProfile /></ProtectedRoute>} />

        <Route path="customers" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><CustomerList /></ProtectedRoute>} />
        <Route path="customers/:id" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><CustomerProfile /></ProtectedRoute>} />

        <Route path="tables" element={<ProtectedRoute roles={["Admin","Manager"]}><Tables /></ProtectedRoute>} />

        <Route path="menu" element={<ProtectedRoute roles={["Admin","Manager"]}><MenuList /></ProtectedRoute>} />
        <Route path="menu/categories" element={<ProtectedRoute roles={["Admin","Manager"]}><Categories /></ProtectedRoute>} />
        <Route path="menu/recipes" element={<ProtectedRoute roles={["Admin","Manager"]}><Recipes /></ProtectedRoute>} />

        <Route path="staff" element={<Navigate to="/staff/mark-attendance" replace />} />
        <Route path="staff/mark-attendance" element={<ProtectedRoute roles={["Admin","Manager"]}><StaffAttendance initialTab="attendance" showTabs={false} /></ProtectedRoute>} />
        <Route path="staff/add" element={<ProtectedRoute roles={["Admin","Manager"]}><StaffAttendance initialTab="addStaff" showTabs={false} /></ProtectedRoute>} />
        <Route path="staff/daily" element={<ProtectedRoute roles={["Admin","Manager"]}><StaffAttendance initialTab="daily" showTabs={false} /></ProtectedRoute>} />
        <Route path="staff/monthly" element={<ProtectedRoute roles={["Admin","Manager"]}><StaffAttendance initialTab="monthly" showTabs={false} /></ProtectedRoute>} />
        <Route path="staff/advances" element={<ProtectedRoute roles={["Admin","Manager"]}><StaffAttendance initialTab="advances" showTabs={false} /></ProtectedRoute>} />
        <Route path="staff/payroll" element={<ProtectedRoute roles={["Admin","Manager"]}><StaffAttendance initialTab="payroll" showTabs={false} /></ProtectedRoute>} />
        <Route path="staff/payroll/summary/:staffId" element={<ProtectedRoute roles={["Admin","Manager"]}><StaffAttendance initialTab="payrollSummary" showTabs={false} /></ProtectedRoute>} />
        <Route path="staff/history/:staffId" element={<ProtectedRoute roles={["Admin","Manager"]}><StaffAttendance initialTab="staffHistory" showTabs={false} /></ProtectedRoute>} />
        <Route path="staff/settings" element={<ProtectedRoute roles={["Admin","Manager"]}><StaffAttendance initialTab="settings" showTabs={false} /></ProtectedRoute>} />
        {/* Staff manage removed */}

        <Route path="expenses" element={<Navigate to="/expenses/new" replace />} />
        <Route path="expenses/new" element={<ProtectedRoute roles={["Admin","Manager"]}><ExpenseNew /></ProtectedRoute>} />
        <Route path="expenses/history" element={<ProtectedRoute roles={["Admin","Manager"]}><ExpenseHistory /></ProtectedRoute>} />


        <Route path="riders" element={<ProtectedRoute roles={["Admin","Manager"]}><RiderList /></ProtectedRoute>} />
        <Route path="riders/live" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><RiderLiveMap /></ProtectedRoute>} />
        <Route path="riders/assign" element={<ProtectedRoute roles={["Admin","Manager"]}><RiderAssign /></ProtectedRoute>} />
        <Route path="riders/daily" element={<ProtectedRoute roles={["Admin","Manager"]}><RiderDaily /></ProtectedRoute>} />

        <Route path="profit-loss" element={<ProtectedRoute roles={["Admin","Manager"]}><ProfitLoss /></ProtectedRoute>} />
        <Route path="audit" element={<ProtectedRoute roles={["Admin"]}><AuditLog /></ProtectedRoute>} />
        <Route path="users" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><UserList /></ProtectedRoute>} />
        <Route path="sidebar-permissions" element={<ProtectedRoute roles={["Admin","Manager"]}><SidebarPermissions /></ProtectedRoute>} />
        <Route path="settings" element={<ProtectedRoute roles={["Admin","Manager"]}><Settings /></ProtectedRoute>} />
        <Route path="printers" element={<ProtectedRoute roles={["Admin","Manager"]}><PrinterSettings /></ProtectedRoute>} />
        <Route path="cloud-sync" element={<ProtectedRoute roles={["Admin","Manager"]}><CloudSyncSettings /></ProtectedRoute>} />
        <Route path="backup-security" element={<ProtectedRoute roles={["Admin","Manager"]}><BackupSecurity /></ProtectedRoute>} />
        <Route path="biometric-settings" element={<ProtectedRoute roles={["Admin"]}><BiometricSettings /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </>
  )
}

export default App
