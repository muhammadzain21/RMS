/**
 * Long-term layout:
 *   src/features/<domain>/{pages,components,utils}
 *   src/shared/{components,utils}
 *
 * Keys = current flat basename under pages|components|utils
 */
export const PAGE_FEATURE = {
  Dashboard: 'dashboard',
  ProfitLoss: 'dashboard',

  SalesNew: 'sales',
  SalesHistory: 'sales',
  SalesSummary: 'sales',
  DeletedSales: 'sales',
  ReturnNew: 'sales',
  ReturnHistory: 'sales',
  KotHistory: 'sales',
  KDS: 'sales',
  VoidHistory: 'sales',
  CallCenterInbox: 'sales',
  AdvanceBooking: 'sales',
  TrackingInfo: 'sales',

  CashOpening: 'day',
  CashCount: 'day',
  PayInOut: 'day',
  MyShift: 'day',
  DayClose: 'day',

  InventoryList: 'inventory',
  InventoryForm: 'inventory',
  TransferInbox: 'inventory',
  PhysicalStock: 'inventory',
  DemandList: 'inventory',

  WarehouseStock: 'warehouse',
  WarehouseSuppliers: 'warehouse',
  WarehouseSupplierHistory: 'warehouse',
  WarehouseTransfers: 'warehouse',
  WarehouseTransferHistory: 'warehouse',
  WarehouseFinance: 'warehouse',
  WarehouseDemands: 'warehouse',
  WarehousePurchases: 'warehouse',
  WarehousePayments: 'warehouse',

  MenuList: 'menu',
  Categories: 'menu',
  Recipes: 'menu',

  CustomerList: 'customers',
  CustomerProfile: 'customers',

  SupplierList: 'suppliers',
  SupplierProfile: 'suppliers',
  SupplyNew: 'suppliers',
  SupplyHistory: 'suppliers',

  RiderList: 'riders',
  RiderAssign: 'riders',
  RiderDaily: 'riders',
  RiderLiveMap: 'riders',

  StaffAttendance: 'staff',
  StaffHistoryPage: 'staff',
  StaffMonthSummaryPage: 'staff',

  MyWorkPage: 'my-work',
  MyHome: 'my-work',
  MyAttendance: 'my-work',
  MyPurchases: 'my-work',
  MyAdvances: 'my-work',
  MyEarnings: 'my-work',
  MySalary: 'my-work',
  MyRider: 'my-work',

  ExpenseNew: 'expenses',
  ExpenseHistory: 'expenses',

  SalesReports: 'reports',
  InventoryReports: 'reports',
  ConsumptionReports: 'reports',

  BranchesAdmin: 'warehouse',
  CallCenterOrders: 'warehouse',
  HqCompare: 'warehouse',

  Tables: 'tables',

  UserList: 'admin',
  SidebarPermissions: 'admin',
  Login: 'admin',
  Settings: 'admin',
  PrinterSettings: 'admin',
  CloudSyncSettings: 'admin',
  BackupSecurity: 'admin',
  BiometricSettings: 'admin',
  AuditLog: 'admin',
  DataManager: 'admin',
  ServerConfig: 'admin',
}

export const COMPONENT_FEATURE = {
  // sales POS
  ActionButtons: 'sales',
  AddCustomerModal: 'sales',
  BankPaymentDialog: 'sales',
  BillSummary: 'sales',
  CardPaymentDialog: 'sales',
  CartTable: 'sales',
  CategoryBar: 'sales',
  DealBuilderDialog: 'sales',
  DealModal: 'sales',
  DeliveryCustomerModal: 'sales',
  HeldDialog: 'sales',
  ItemsGrid: 'sales',
  ItemsList: 'sales',
  KotModal: 'sales',
  OrderViewDialog: 'sales',
  PaymentMethodDialog: 'sales',
  PaymentModal: 'sales',
  PosHeader: 'sales',
  RecallDialog: 'sales',
  ReceiptPreview: 'sales',
  SelectRiderModal: 'sales',
  StaffPaymentDialog: 'sales',
  VoidPreview: 'sales',
  VoidReasonModal: 'sales',

  DailyStockView: 'inventory',
  IngredientModal: 'inventory',
  BranchPurchaseModal: 'inventory',
  DemandModal: 'inventory',

  WarehouseItemModal: 'warehouse',
  WarehousePaymentModal: 'warehouse',
  WarehousePurchaseModal: 'warehouse',
  WarehouseSupplierModal: 'warehouse',

  MenuAddDialog: 'menu',
  MenuEditDialog: 'menu',

  CustomerModal: 'customers',
  SupplierModal: 'suppliers',

  AddAdvanceDialog: 'staff',
  AddStaffTab: 'staff',
  AdvancesTab: 'staff',
  DailyViewTab: 'staff',
  MarkAttendanceTab: 'staff',
  MonthlyViewTab: 'staff',
  PayrollTab: 'staff',
  SalarySlipDialog: 'staff',
  StaffEarningsDialog: 'staff',
  StaffFormDialog: 'staff',
  StaffSettingsTab: 'staff',

  MyWorkShared: 'my-work',

  ReportHub: 'reports',

  BranchModal: 'warehouse',

  // shared / global
  ChartCard: 'shared',
  ConfirmDialog: 'shared',
  DataTable: 'shared',
  DatePicker: 'shared',
  DeleteKeyModal: 'shared',
  ErrorBoundary: 'shared',
  HeldModal: 'shared',
  LicenseGate: 'shared',
  PageHero: 'shared',
  Pagination: 'shared',
  ProtectedRoute: 'shared',
  SlipDialog: 'shared',
  StatCard: 'shared',
  StatsCard: 'shared',
  SuperAdminPortal: 'shared',
  SyncBootstrap: 'shared',
  ThemeToggle: 'shared',
  UiPageHero: 'shared',
  useConfirm: 'shared',
}

export const UTIL_FEATURE = {
  cartUtils: 'sales',
  printUtils: 'sales',
  billPrint: 'sales',
  kotPrint: 'sales',
  thermalCss: 'sales',
  slipPreview: 'sales',
  escposClient: 'sales',
  shared: 'sales', // print shared helpers
  kdsSounds: 'sales',
  callCenterStatus: 'sales',

  warehouseApi: 'warehouse',
  menuFormUtils: 'menu',
  customerLedgerUtils: 'customers',
  expenseVoucherDoc: 'expenses',
  salaryCalc: 'staff',
  printSalarySlip: 'staff',
  printStaffSummary: 'staff',
  myWorkPages: 'my-work',
  riderGeo: 'riders',

  reportCommon: 'reports',
  reportSalesEngine: 'reports',
  reportSalesTypes: 'reports',
  reportInventoryEngine: 'reports',
  reportInventoryTypes: 'reports',
  reportConsumptionEngine: 'reports',
  reportConsumptionTypes: 'reports',

  dateUtils: 'shared',
  listReportExport: 'shared',
  reportDoc: 'shared',
  pdfPreview: 'shared',
  spreadsheetIo: 'shared',
  maps: 'shared',
  branchWorkspace: 'shared',
  timezoneDebug: 'shared',
  userBusy: 'shared',
}

export function destFor(kind, base) {
  const name = base.replace(/\.(jsx?|tsx?)$/, '')
  if (kind === 'page') {
    const f = PAGE_FEATURE[name]
    if (!f) throw new Error(`No feature for page ${name}`)
    return `features/${f}/pages/${base}`
  }
  if (kind === 'component') {
    const f = COMPONENT_FEATURE[name]
    if (!f) throw new Error(`No feature for component ${name}`)
    return f === 'shared' ? `shared/components/${base}` : `features/${f}/components/${base}`
  }
  if (kind === 'util') {
    const f = UTIL_FEATURE[name]
    if (!f) throw new Error(`No feature for util ${name}`)
    return f === 'shared' ? `shared/utils/${base}` : `features/${f}/utils/${base}`
  }
  throw new Error(kind)
}
