import Settings from '../models/Settings.js'
import BiometricConfig from '../models/BiometricConfig.js'

const LEGACY_BRANCH = {
  $or: [
    { branchId: null },
    { branchId: '' },
    { branchId: { $exists: false } },
  ],
}

function cloneDoc(doc, branchId) {
  const base = doc?.toObject ? doc.toObject() : { ...(doc || {}) }
  delete base._id
  delete base.__v
  delete base.createdAt
  delete base.updatedAt
  return { ...base, branchId: String(branchId) }
}

/** Settings for a branch (creates from legacy/global template on first use). */
export async function getOrCreateSettings(branchId = '') {
  const bid = String(branchId || '').trim()
  if (bid) {
    let s = await Settings.findOne({ branchId: bid })
    if (s) return s
    const legacy = await Settings.findOne(LEGACY_BRANCH, {}, { sort: { updatedAt: -1, createdAt: -1 } })
    if (legacy) return Settings.create(cloneDoc(legacy, bid))
    return Settings.create({ companyName: 'Restaurant POS', branchId: bid })
  }
  let s = await Settings.findOne(LEGACY_BRANCH, {}, { sort: { updatedAt: -1, createdAt: -1 } })
  if (!s) s = await Settings.findOne({}, {}, { sort: { updatedAt: -1, createdAt: -1 } })
  if (!s) s = await Settings.create({ companyName: 'Restaurant POS', branchId: '' })
  return s
}

/** Lean settings for operational routes (tax, printers, cutoff). */
export async function getSettingsLean(branchId = '') {
  const s = await getOrCreateSettings(branchId)
  return s?.toObject ? s.toObject() : s
}

/** Biometric device config per branch. */
export async function getOrCreateBiometricConfig(branchId = '') {
  const bid = String(branchId || '').trim()
  if (bid) {
    let cfg = await BiometricConfig.findOne({ branchId: bid })
    if (cfg) return cfg
    const legacy = await BiometricConfig.findOne(LEGACY_BRANCH, {}, { sort: { updatedAt: -1, createdAt: -1 } })
    if (legacy) return BiometricConfig.create(cloneDoc(legacy, bid))
    return BiometricConfig.create({ branchId: bid })
  }
  let cfg = await BiometricConfig.findOne(LEGACY_BRANCH, {}, { sort: { updatedAt: -1, createdAt: -1 } })
  if (!cfg) cfg = await BiometricConfig.findOne({}, {}, { sort: { updatedAt: -1, createdAt: -1 } })
  if (!cfg) cfg = await BiometricConfig.create({ branchId: '' })
  return cfg
}

/** All enabled biometric configs (for multi-branch pollers later). */
export async function listEnabledBiometricConfigs() {
  return BiometricConfig.find({ enabled: true }).sort({ updatedAt: -1 }).lean()
}
