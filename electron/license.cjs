// License validation — file store in userData (reliable) + optional registry mirror.
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const PERMANENT_KEYS = new Set([
  'PIZZA-PERMANENT-LICENSE-KEY0',
  'EPICSPIRE-PERMANENT',
  'EPIC-PERMANENT',
])

function createLicenseSystem({ app, getMainWindow }) {
  let licenseCheckInterval = null

  function licenseStorePath() {
    try { return path.join(app.getPath('userData'), 'license.json') } catch { return '' }
  }

  function readLicenseStore() {
    try {
      const p = licenseStorePath()
      if (!p || !fs.existsSync(p)) return {}
      const j = JSON.parse(fs.readFileSync(p, 'utf8'))
      return j && typeof j === 'object' ? j : {}
    } catch { return {} }
  }

  function writeLicenseStore(patch) {
    try {
      const p = licenseStorePath()
      if (!p) return false
      const next = { ...readLicenseStore(), ...patch }
      for (const [k, v] of Object.entries(next)) {
        if (v == null) delete next[k]
      }
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, JSON.stringify(next, null, 2), 'utf8')
      return true
    } catch { return false }
  }

  function readRegValue(name) {
    try {
      if (process.platform !== 'win32') return null
      const out = execSync(`reg query "HKCU\\Software\\PizzaBar" /v ${name}`, { encoding: 'utf8' })
      const re = new RegExp(`${name}\\s+REG_\\w+\\s+(.+)$`, 'mi')
      const m = out.match(re)
      return m ? m[1].trim() : null
    } catch { return null }
  }

  function writeRegValue(name, value) {
    try {
      if (process.platform !== 'win32') return false
      execSync(`reg add "HKCU\\Software\\PizzaBar" /v ${name} /t REG_SZ /d "${String(value)}" /f`, { stdio: 'ignore' })
      return true
    } catch { return false }
  }

  function deleteRegValue(name) {
    try {
      if (process.platform !== 'win32') return false
      execSync(`reg delete "HKCU\\Software\\PizzaBar" /v ${name} /f`, { stdio: 'ignore' })
      return true
    } catch { return false }
  }

  function licenseField(name) {
    const store = readLicenseStore()
    if (store[name] != null && String(store[name]).trim() !== '') return String(store[name]).trim()
    const fromReg = readRegValue(name)
    return fromReg ? String(fromReg).trim() : null
  }

  function getLicenseKey() {
    const k = licenseField('LicenseKey')
    return k ? String(k).toUpperCase() : null
  }

  function parsePrefixDays(key) {
    const up = String(key || '').trim().toUpperCase().replace(/\s+/g, '')
    const m = up.match(/^([A-Z]{2,5})[-:](\d{1,4})$/)
    if (!m) return null
    return { prefix: m[1], days: parseInt(m[2], 10), key: up }
  }

  function validateLegacyKey(key) {
    try {
      if (!key || typeof key !== 'string') return { valid: false, error: 'No license key' }
      const up = key.trim().toUpperCase().replace(/\s+/g, '')
      if (PERMANENT_KEYS.has(up) || up.length === 24) {
        return { valid: true, expiryDate: null, daysRemaining: Infinity, permanent: true }
      }
      const parts = up.split('-')
      if (parts.length === 5 && parts[0] === 'PIZZA') {
        const year = parts[1]
        const monthDay = parts[2]
        if (year && monthDay && year.length === 4 && monthDay.length === 4) {
          const expiryDate = new Date(`${year}-${monthDay.slice(0, 2)}-${monthDay.slice(2, 4)}T23:59:59`)
          const now = new Date()
          if (now > expiryDate) return { valid: false, error: 'License expired', expired: true, expiryDate }
          const daysRemaining = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24))
          return { valid: true, expiryDate, daysRemaining }
        }
      }
      return { valid: false, error: 'Invalid key' }
    } catch {
      return { valid: false, error: 'Invalid key' }
    }
  }

  function getLicenseInfo() {
    const k = getLicenseKey()
    if (!k) return { valid: false, error: 'No license key', daysRemaining: -1 }

    const legacy = validateLegacyKey(k)
    if (legacy.valid && legacy.permanent) return legacy

    const prefixDays = parsePrefixDays(k)
    let days = NaN
    let installStr = licenseField('LicenseInstallDate')

    if (prefixDays) days = prefixDays.days
    else {
      const rawDays = licenseField('LicenseDays')
      days = rawDays ? parseInt(String(rawDays).trim(), 10) : NaN
    }

    if (!installStr && Number.isFinite(days) && days > 0) {
      installStr = new Date().toISOString().slice(0, 10)
      writeLicenseStore({ LicenseInstallDate: installStr })
      writeRegValue('LicenseInstallDate', installStr)
    }

    if (Number.isFinite(days) && days > 0 && installStr) {
      const [y, m, d] = String(installStr).split('-').map(n => parseInt(n, 10))
      const start = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0)
      const expiry = new Date(start.getTime() + days * 24 * 60 * 60 * 1000)
      const now = new Date()
      const remaining = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24))
      const valid = remaining >= 0
      return {
        valid,
        expiryDate: expiry,
        daysRemaining: valid ? remaining : -1,
        expired: !valid,
        error: valid ? undefined : 'License expired',
      }
    }

    return legacy.valid ? legacy : { valid: false, error: legacy.error || 'Invalid key', daysRemaining: -1 }
  }

  function checkLicenseBlocking() {
    getLicenseInfo()
    return true
  }

  function startPeriodicLicenseCheck() {
    if (licenseCheckInterval) clearInterval(licenseCheckInterval)
    licenseCheckInterval = setInterval(() => {
      const result = getLicenseInfo()
      try {
        const win = getMainWindow?.()
        if (win && !win.isDestroyed()) win.webContents.send('license:status', result)
      } catch {}
    }, 60 * 60 * 1000)
  }

  function activate(key) {
    const k = String(key || '').trim().toUpperCase().replace(/\s+/g, '')
    if (!k) return { ok: false, error: 'Enter a license key' }

    const prefixDays = parsePrefixDays(k)
    if (prefixDays) {
      const install = new Date().toISOString().slice(0, 10)
      const saved = writeLicenseStore({
        LicenseKey: prefixDays.key,
        LicensePrefix: prefixDays.prefix,
        LicenseDays: String(prefixDays.days),
        LicenseInstallDate: install,
      })
      writeRegValue('LicenseKey', prefixDays.key)
      writeRegValue('LicensePrefix', prefixDays.prefix)
      writeRegValue('LicenseDays', String(prefixDays.days))
      writeRegValue('LicenseInstallDate', install)
      if (!saved && !getLicenseKey()) {
        return { ok: false, error: 'Could not save license on this PC' }
      }
    } else {
      const v = validateLegacyKey(k)
      if (!v.valid) return { ok: false, error: v.error || 'Invalid license key' }
      const saved = writeLicenseStore({
        LicenseKey: k,
        LicensePrefix: undefined,
        LicenseDays: undefined,
        LicenseInstallDate: undefined,
      })
      // Explicitly drop timed fields so an old expired BJ-* cannot override permanent
      const cur = readLicenseStore()
      delete cur.LicensePrefix
      delete cur.LicenseDays
      delete cur.LicenseInstallDate
      cur.LicenseKey = k
      try {
        const p = licenseStorePath()
        if (p) {
          fs.mkdirSync(path.dirname(p), { recursive: true })
          fs.writeFileSync(p, JSON.stringify(cur, null, 2), 'utf8')
        }
      } catch {}
      writeRegValue('LicenseKey', k)
      deleteRegValue('LicensePrefix')
      deleteRegValue('LicenseDays')
      deleteRegValue('LicenseInstallDate')
      if (!saved && !getLicenseKey()) {
        return { ok: false, error: 'Could not save license on this PC' }
      }
    }

    const status = { ...getLicenseInfo(), dev: !app.isPackaged }
    try {
      const win = getMainWindow?.()
      if (win && !win.isDestroyed()) win.webContents.send('license:status', status)
    } catch {}
    if (!status.valid) return { ok: false, error: status.error || 'License expired or invalid', status }
    return { ok: true, status }
  }

  return {
    getLicenseInfo,
    getLicenseKey,
    checkLicenseBlocking,
    startPeriodicLicenseCheck,
    activate,
  }
}

module.exports = { createLicenseSystem }
