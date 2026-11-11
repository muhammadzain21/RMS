import mongoose from 'mongoose'

const ModifierCfgSchema = new mongoose.Schema({
  key: String,
  label: String,
  price: { type: Number, default: 0 },
}, { _id: false })

const SettingsSchema = new mongoose.Schema({
  // Empty = legacy/global HQ template; real branches get their own doc
  branchId: { type: String, default: '' },
  companyName: { type: String, default: 'Restaurant POS' },
  // Company details
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  address: { type: String, default: '' },
  logo: { type: String, default: '' }, // base64 data URL
  taxRate: { type: Number, default: 0 },
  // Sell page: show Personal (complimentary) payment option
  showPersonalPayment: { type: Boolean, default: false },
  // Sell page bill fields — unchecked = hidden on Sell (all branches). Default all off.
  sellPageFields: {
    type: {
      totalTax: { type: Boolean, default: false },
      amountIncTax: { type: Boolean, default: false },
      totalItemsDiscount: { type: Boolean, default: false },
      billDiscPct: { type: Boolean, default: false },
      billDiscAmt: { type: Boolean, default: false },
      serviceCharges: { type: Boolean, default: false },
      taxAmt: { type: Boolean, default: false },
    },
    default: () => ({
      totalTax: false,
      amountIncTax: false,
      totalItemsDiscount: false,
      billDiscPct: false,
      billDiscAmt: false,
      serviceCharges: false,
      taxAmt: false,
    }),
  },
  // Dashboard behavior: whether 'Today' widgets should use business day (tied to day close)
  useBusinessDayForToday: { type: Boolean, default: true },
  // Business day cutoff hour (0-23). If now < cutoff, "business today" is yesterday.
  businessDayCutoffHour: { type: Number, default: 4 },
  // Auto-backup preferences
  autoBackupEnabled: { type: Boolean, default: false },
  autoBackupIntervalMinutes: { type: Number, default: 60 },
  // Auto-backup destination folder (Electron desktop only)
  backupFolderPath: { type: String, default: '' },
  // Printing preferences
  // KOT and Void slips use the same printer
  kotPrinterName: { type: String, default: '' },
  // Bill slip and Customer Bill use the same printer
  billPrinterName: { type: String, default: '' },
  tables: { type: [String], default: [] },
  modifiers: { type: [ModifierCfgSchema], default: [] },
  billingFooter: { type: String, default: '' },
  // Security: key required to delete a sale (plain text)
  salesDeleteKey: { type: String, default: '' },
  // POS tile layout: number of tiles per row for category and item grids
  posCategoryTilesPerRow: { type: Number, default: 4 },
  posItemTilesPerRow: { type: Number, default: 4 },
  // Feature access: array of enabled sidebar paths (null/empty = all enabled).
  // Managed only by the SuperAdmin portal.
  enabledPaths: { type: mongoose.Schema.Types.Mixed, default: null },
  // Chart of expense heads (categories) used on Expenses page
  expenseHeads: {
    type: [String],
    default: ['Rent', 'Utilities', 'Wages', 'Salaries', 'Supplies', 'Transport', 'Marketing', 'Maintenance', 'Misc'],
  },
  // One-time copy of legacy unscoped tables/suppliers into this branch
  tablesCatalogSeeded: { type: Boolean, default: false },
  suppliersCatalogSeeded: { type: Boolean, default: false },
}, { timestamps: true })

SettingsSchema.index(
  { branchId: 1 },
  { unique: true, partialFilterExpression: { branchId: { $type: 'string', $gt: '' } } }
)

export default mongoose.model('Settings', SettingsSchema)
