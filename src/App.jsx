import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './layout/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import InventoryList from './pages/inventory/InventoryList.jsx'
import InventoryForm from './pages/inventory/InventoryForm.jsx'
import SalesNew from './pages/sales/SalesNew.jsx'
import SalesHistory from './pages/sales/SalesHistory.jsx'
import DeletedSales from './pages/sales/DeletedSales.jsx'
import SalesSummary from './pages/sales/SalesSummary.jsx'
import Consumption from './pages/sales/Consumption.jsx'
import ReturnNew from './pages/sales/ReturnNew.jsx'
import ReturnHistory from './pages/sales/ReturnHistory.jsx'
import CashOpening from './pages/sales/CashOpening.jsx'
import CashCount from './pages/sales/CashCount.jsx'
import AdvanceBooking from './pages/sales/AdvanceBooking.jsx'
import DayClose from './pages/sales/DayClose.jsx'
import DataManager from './pages/DataManager.jsx'
import PayInOut from './pages/sales/PayInOut.jsx'
import MyShift from './pages/sales/MyShift.jsx'
import KotHistory from './pages/sales/KotHistory.jsx'
import KDS from './pages/sales/KDS.jsx'
import VoidHistory from './pages/sales/VoidHistory.jsx'
import SupplyNew from './pages/supply/SupplyNew.jsx'
import SupplyHistory from './pages/supply/SupplyHistory.jsx'
import DemandList from './pages/DemandList.jsx'
import StaffAttendance from './pages/staff/StaffAttendance.jsx'
import MyWorkLayout from './pages/my/myWorkShared.jsx'
import MyHome from './pages/my/MyHome.jsx'
import MyAttendance from './pages/my/MyAttendance.jsx'
import MyPurchases from './pages/my/MyPurchases.jsx'
import MyAdvances from './pages/my/MyAdvances.jsx'
import MyEarnings from './pages/my/MyEarnings.jsx'
import MySalary from './pages/my/MySalary.jsx'
import ExpenseNew from './pages/expenses/ExpenseNew.jsx'
import ExpenseHistory from './pages/expenses/ExpenseHistory.jsx'
import RiderList from './pages/riders/RiderList.jsx'
import RiderAssign from './pages/riders/RiderAssign.jsx'
import RiderDaily from './pages/riders/RiderDaily.jsx'
import ProfitLoss from './pages/ProfitLoss.jsx'
import Settings from './pages/settings/Settings.jsx'
import BiometricSettings from './pages/settings/BiometricSettings.jsx'
import AuditLog from './pages/AuditLog.jsx'
import UserList from './pages/users/UserList.jsx'
import SidebarPermissions from './pages/users/SidebarPermissions.jsx'
import Login from './pages/users/Login.jsx'
import ServerConfig from './pages/ServerConfig.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import SuperAdminPortal from './components/SuperAdminPortal.jsx'
import LicenseGate from './components/LicenseGate.jsx'
import { useState, useEffect } from 'react'
import SupplierList from './pages/suppliers/SupplierList.jsx'
import SupplierProfile from './pages/suppliers/SupplierProfile.jsx'
import CustomerList from './pages/customers/CustomerList.jsx'
import CustomerProfile from './pages/customers/CustomerProfile.jsx'
import Tables from './pages/tables/Tables.jsx'
import MenuList from './pages/menu/MenuList.jsx'
import Categories from './pages/menu/Categories.jsx'
import Recipes from './pages/menu/Recipes.jsx'
import BranchesAdmin from './pages/hq/BranchesAdmin.jsx'
import CallCenterOrders from './pages/hq/CallCenterOrders.jsx'
import HqCompare from './pages/hq/HqCompare.jsx'
import CallCenterInbox from './pages/sales/CallCenterInbox.jsx'
import TransferInbox from './pages/inventory/TransferInbox.jsx'
import SyncBootstrap from './components/SyncBootstrap.jsx'
import WarehouseStock from './pages/warehouse/WarehouseStock.jsx'
import WarehouseSuppliers from './pages/warehouse/WarehouseSuppliers.jsx'
import WarehouseSupplierHistory from './pages/warehouse/WarehouseSupplierHistory.jsx'
import WarehouseTransfers from './pages/warehouse/WarehouseTransfers.jsx'
import WarehouseTransferHistory from './pages/warehouse/WarehouseTransferHistory.jsx'

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

        <Route path="inventory" element={<ProtectedRoute roles={["Admin","Manager"]}><InventoryList /></ProtectedRoute>} />
        <Route path="inventory/new" element={<ProtectedRoute roles={["Admin","Manager"]}><InventoryForm /></ProtectedRoute>} />
        <Route path="inventory/transfers-in" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><TransferInbox /></ProtectedRoute>} />
        <Route path="inventory/:id" element={<ProtectedRoute roles={["Admin","Manager"]}><InventoryForm /></ProtectedRoute>} />
        <Route path="warehouse" element={<Navigate to="/warehouse/stock" replace />} />
        <Route path="warehouse/stock" element={<ProtectedRoute roles={["Admin","Manager"]}><WarehouseStock /></ProtectedRoute>} />
        <Route path="warehouse/suppliers" element={<ProtectedRoute roles={["Admin","Manager"]}><WarehouseSuppliers /></ProtectedRoute>} />
        <Route path="warehouse/suppliers/:id/history" element={<ProtectedRoute roles={["Admin","Manager"]}><WarehouseSupplierHistory /></ProtectedRoute>} />
        <Route path="warehouse/purchases" element={<Navigate to="/warehouse/suppliers" replace />} />
        <Route path="warehouse/payments" element={<Navigate to="/warehouse/suppliers" replace />} />
        <Route path="warehouse/transfers" element={<ProtectedRoute roles={["Admin","Manager"]}><WarehouseTransfers /></ProtectedRoute>} />
        <Route path="warehouse/transfer-history" element={<ProtectedRoute roles={["Admin","Manager"]}><WarehouseTransferHistory /></ProtectedRoute>} />
        <Route path="branches" element={<ProtectedRoute roles={["Admin"]}><BranchesAdmin /></ProtectedRoute>} />
        <Route path="hq/compare" element={<ProtectedRoute roles={["Admin","Manager"]}><HqCompare /></ProtectedRoute>} />

        <Route path="sales/new" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><SalesNew /></ProtectedRoute>} />
        <Route path="sales/cc-inbox" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><CallCenterInbox /></ProtectedRoute>} />
        <Route path="call-center" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><CallCenterOrders /></ProtectedRoute>} />
        <Route path="sales/return" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><ReturnNew /></ProtectedRoute>} />
        <Route path="sales/history" element={<ProtectedRoute roles={["Admin","Manager"]}><SalesHistory /></ProtectedRoute>} />
        <Route path="sales/deleted" element={<ProtectedRoute roles={["Admin"]}><DeletedSales /></ProtectedRoute>} />
        <Route path="sales/return-history" element={<ProtectedRoute roles={["Admin","Manager"]}><ReturnHistory /></ProtectedRoute>} />
        <Route path="sales/summary" element={<ProtectedRoute roles={["Admin","Manager"]}><SalesSummary /></ProtectedRoute>} />
        <Route path="sales/consumption" element={<ProtectedRoute roles={["Admin","Manager"]}><Consumption /></ProtectedRoute>} />
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
        <Route path="riders/assign" element={<ProtectedRoute roles={["Admin","Manager"]}><RiderAssign /></ProtectedRoute>} />
        <Route path="riders/daily" element={<ProtectedRoute roles={["Admin","Manager"]}><RiderDaily /></ProtectedRoute>} />

        <Route path="profit-loss" element={<ProtectedRoute roles={["Admin","Manager"]}><ProfitLoss /></ProtectedRoute>} />
        <Route path="audit" element={<ProtectedRoute roles={["Admin"]}><AuditLog /></ProtectedRoute>} />
        <Route path="users" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><UserList /></ProtectedRoute>} />
        <Route path="sidebar-permissions" element={<ProtectedRoute roles={["Admin","Manager"]}><SidebarPermissions /></ProtectedRoute>} />
        <Route path="settings" element={<ProtectedRoute roles={["Admin","Manager"]}><Settings /></ProtectedRoute>} />
        <Route path="biometric-settings" element={<ProtectedRoute roles={["Admin"]}><BiometricSettings /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </>
  )
}

export default App
