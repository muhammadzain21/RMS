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
import CashHandover from './pages/sales/CashHandover.jsx'
import CashCount from './pages/sales/CashCount.jsx'
import AdvanceBooking from './pages/sales/AdvanceBooking.jsx'
import DayClose from './pages/sales/DayClose.jsx'
import PayInOut from './pages/sales/PayInOut.jsx'
import KotHistory from './pages/sales/KotHistory.jsx'
import VoidHistory from './pages/sales/VoidHistory.jsx'
import SupplyNew from './pages/supply/SupplyNew.jsx'
import SupplyHistory from './pages/supply/SupplyHistory.jsx'
import DemandList from './pages/DemandList.jsx'
import StaffAttendance from './pages/staff/StaffAttendance.jsx'  
import ExpenseNew from './pages/expenses/ExpenseNew.jsx'
import ExpenseHistory from './pages/expenses/ExpenseHistory.jsx'
import RiderList from './pages/riders/RiderList.jsx'
import RiderAssign from './pages/riders/RiderAssign.jsx'
import RiderDaily from './pages/riders/RiderDaily.jsx'
import ProfitLoss from './pages/ProfitLoss.jsx'
import Settings from './pages/settings/Settings.jsx'
import BiometricSettings from './pages/settings/BiometricSettings.jsx'
import Cashbook from './pages/finance/Cashbook.jsx'
import AuditLog from './pages/AuditLog.jsx'
import UserList from './pages/users/UserList.jsx'
import SidebarPermissions from './pages/users/SidebarPermissions.jsx'
import Login from './pages/users/Login.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import SupplierList from './pages/suppliers/SupplierList.jsx'
import SupplierProfile from './pages/suppliers/SupplierProfile.jsx'
import CustomerList from './pages/customers/CustomerList.jsx'
import CustomerProfile from './pages/customers/CustomerProfile.jsx'
import Tables from './pages/tables/Tables.jsx'
import MenuList from './pages/menu/MenuList.jsx'
import Categories from './pages/menu/Categories.jsx'
import Recipes from './pages/menu/Recipes.jsx'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route index element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><Dashboard /></ProtectedRoute>} />

        <Route path="inventory" element={<ProtectedRoute roles={["Admin","Manager"]}><InventoryList /></ProtectedRoute>} />
        <Route path="inventory/new" element={<ProtectedRoute roles={["Admin","Manager"]}><InventoryForm /></ProtectedRoute>} />
        <Route path="inventory/:id" element={<ProtectedRoute roles={["Admin","Manager"]}><InventoryForm /></ProtectedRoute>} />

        <Route path="sales/new" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><SalesNew /></ProtectedRoute>} />
        <Route path="sales/return" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><ReturnNew /></ProtectedRoute>} />
        <Route path="sales/history" element={<ProtectedRoute roles={["Admin","Manager"]}><SalesHistory /></ProtectedRoute>} />
        <Route path="sales/deleted" element={<ProtectedRoute roles={["Admin"]}><DeletedSales /></ProtectedRoute>} />
        <Route path="sales/return-history" element={<ProtectedRoute roles={["Admin","Manager"]}><ReturnHistory /></ProtectedRoute>} />
        <Route path="sales/summary" element={<ProtectedRoute roles={["Admin","Manager"]}><SalesSummary /></ProtectedRoute>} />
        <Route path="sales/consumption" element={<ProtectedRoute roles={["Admin","Manager"]}><Consumption /></ProtectedRoute>} />
        <Route path="sales/kot-history" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><KotHistory /></ProtectedRoute>} />
        <Route path="sales/void-history" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><VoidHistory /></ProtectedRoute>} />
        <Route path="sales/cash-opening" element={<ProtectedRoute roles={["Admin","Manager"]}><CashOpening /></ProtectedRoute>} />
        <Route path="sales/cash-handover" element={<ProtectedRoute roles={["Admin","Manager"]}><CashHandover /></ProtectedRoute>} />
        <Route path="sales/cash-count" element={<ProtectedRoute roles={["Admin","Manager"]}><CashCount /></ProtectedRoute>} />
        <Route path="sales/advance-booking" element={<ProtectedRoute roles={["Admin","Manager","Staff"]}><AdvanceBooking /></ProtectedRoute>} />
        <Route path="sales/day-close" element={<ProtectedRoute roles={["Admin","Manager"]}><DayClose /></ProtectedRoute>} />
        <Route path="sales/pay-in-out" element={<ProtectedRoute roles={["Admin","Manager"]}><PayInOut /></ProtectedRoute>} />

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
        <Route path="staff/settings" element={<ProtectedRoute roles={["Admin","Manager"]}><StaffAttendance initialTab="settings" showTabs={false} /></ProtectedRoute>} />
        {/* Staff manage removed */}

        <Route path="expenses" element={<Navigate to="/expenses/new" replace />} />
        <Route path="expenses/new" element={<ProtectedRoute roles={["Admin","Manager"]}><ExpenseNew /></ProtectedRoute>} />
        <Route path="expenses/history" element={<ProtectedRoute roles={["Admin","Manager"]}><ExpenseHistory /></ProtectedRoute>} />


        <Route path="riders" element={<ProtectedRoute roles={["Admin","Manager"]}><RiderList /></ProtectedRoute>} />
        <Route path="riders/assign" element={<ProtectedRoute roles={["Admin","Manager"]}><RiderAssign /></ProtectedRoute>} />
        <Route path="riders/daily" element={<ProtectedRoute roles={["Admin","Manager"]}><RiderDaily /></ProtectedRoute>} />

        <Route path="profit-loss" element={<ProtectedRoute roles={["Admin","Manager"]}><ProfitLoss /></ProtectedRoute>} />
        <Route path="finance/cashbook" element={<ProtectedRoute roles={["Admin","Manager"]}><Cashbook /></ProtectedRoute>} />
        <Route path="audit" element={<ProtectedRoute roles={["Admin"]}><AuditLog /></ProtectedRoute>} />
        <Route path="users" element={<ProtectedRoute roles={["Admin"]}><UserList /></ProtectedRoute>} />
        <Route path="sidebar-permissions" element={<ProtectedRoute roles={["Admin"]}><SidebarPermissions /></ProtectedRoute>} />
        <Route path="settings" element={<ProtectedRoute roles={["Admin","Manager"]}><Settings /></ProtectedRoute>} />
        <Route path="biometric-settings" element={<ProtectedRoute roles={["Admin"]}><BiometricSettings /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
