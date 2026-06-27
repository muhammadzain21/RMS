import mongoose from 'mongoose'

const ModifierCfgSchema = new mongoose.Schema({
  key: String,
  label: String,
  price: { type: Number, default: 0 },
}, { _id: false })

const SettingsSchema = new mongoose.Schema({
  companyName: { type: String, default: 'Restaurant POS' },
  // Company details
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  address: { type: String, default: '' },
  logo: { type: String, default: '' }, // base64 data URL
  taxRate: { type: Number, default: 0 },
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
}, { timestamps: true })

export default mongoose.model('Settings', SettingsSchema)
