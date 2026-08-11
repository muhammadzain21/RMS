// Electron main process
// Loads Vite dev server in development (VITE_DEV_SERVER_URL), or the built index.html in production.

const { app, BrowserWindow, ipcMain, dialog, nativeTheme, nativeImage } = require('electron')
const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const fsp = require('fs').promises
const { pathToFileURL } = require('url')
let printer

let mainWindow

// =========================
// License Validation System
// =========================
const LICENSE_SECRET = 'PizzaBar2024LicenseKey'
const LICENSE_PREFIX = 'BJ' // constant prefix for simple keys like BJ-60 (60 days)
const EXPIRY_WARN_DAYS = 7
let licenseValid = false
let licenseExpiryDate = null
let licenseCheckInterval = null

// Simple XOR decrypt matching NSIS implementation (hex encoded)
function xorDecryptSimple(encryptedHex, key) {
  try {
    // Convert hex string to bytes
    const bytes = []
    for (let i = 0; i < encryptedHex.length; i += 2) {
      bytes.push(parseInt(encryptedHex.substr(i, 2), 16))
    }
    
    // XOR with key
    let result = ''
    for (let i = 0; i < bytes.length; i++) {
      result += String.fromCharCode(bytes[i] ^ key.charCodeAt(i % key.length))
    }
    return result
  } catch {
    return null
  }
}

// Read license key from file (decrypts if encrypted)
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

// Keep for backward compatibility (legacy installs). Prefer registry values instead of file.
function getLegacyLicenseKeyFromFile() {
  const possiblePaths = [
    path.join(__dirname, '..', 'resources', 'app', 'license.key'),
    path.join(__dirname, '..', 'license.key'),
    path.join(process.resourcesPath || '', 'app', 'license.key'),
    path.join(app.getAppPath(), 'license.key')
  ]
  for (const licensePath of possiblePaths) {
    try {
      if (fs.existsSync(licensePath)) {
        const raw = fs.readFileSync(licensePath, 'utf8').trim()
        const decrypted = xorDecryptSimple(raw, 'PIZZABAR2024')
        if (decrypted && decrypted.startsWith('PIZZA-')) return decrypted.toUpperCase()
        if (raw.toUpperCase().startsWith('PIZZA-')) return raw.toUpperCase()
      }
    } catch {}
  }
  return null
}

function getLicenseKey() {
  // Primary source: registry value set by installer
  const fromReg = readRegValue('LicenseKey')
  if (fromReg) return String(fromReg).toUpperCase()
  // Legacy fallback: file (discouraged, but keep for old builds)
  const legacy = getLegacyLicenseKeyFromFile()
  return legacy
}

// Validate license key
function validateLegacyKey(key) {
  try {
    if (!key || typeof key !== 'string') return { valid: false, error: 'No license key' }
    const up = key.trim().toUpperCase()
    const parts = up.split('-')
    if (up === 'PIZZA-PERMANENT-LICENSE-KEY0') return { valid: true, expiryDate: null, daysRemaining: Infinity }
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
    if (up.length === 24) return { valid: true, expiryDate: null, daysRemaining: Infinity }
    return { valid: false, error: 'Invalid key' }
  } catch { return { valid: false, error: 'Invalid key' } }
}

function getLicenseInfo() {
  // Preferred: days-based config from registry
  const rawDays = readRegValue('LicenseDays')
  let days = rawDays ? parseInt(String(rawDays).trim(), 10) : NaN
  const prefix = readRegValue('LicensePrefix') || null
  let installStr = readRegValue('LicenseInstallDate') || null

  // If not configured, try to parse from simple key like BJ-60
  if (!rawDays) {
    const k = getLicenseKey()
    if (k && typeof k === 'string') {
      const m = k.trim().toUpperCase().match(/^([A-Z]{2,5})[-:](\d{1,4})$/)
      if (m) {
        if (!prefix) writeRegValue('LicensePrefix', m[1])
        days = parseInt(m[2], 10)
        writeRegValue('LicenseDays', String(days))
      }
    }
  }

  // Ensure install date exists when days are configured
  if (!installStr && Number.isFinite(days) && days > 0) {
    const nowIso = new Date().toISOString().slice(0, 10)
    writeRegValue('LicenseInstallDate', nowIso)
    installStr = nowIso
  }

  if (Number.isFinite(days) && days > 0 && installStr) {
    const [y, m, d] = String(installStr).split('-').map(n => parseInt(n, 10))
    const start = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0)
    const expiry = new Date(start.getTime() + days * 24 * 60 * 60 * 1000)
    const now = new Date()
    const remaining = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24))
    const valid = remaining >= 0
    return { valid, expiryDate: expiry, daysRemaining: valid ? remaining : -1 }
  }

  // Fallback: legacy key logic
  const legacy = validateLegacyKey(getLicenseKey())
  return legacy
}

// Check license and show blocking dialog if invalid
function checkLicenseBlocking() {
  const result = getLicenseInfo()
  licenseValid = !!result.valid
  licenseExpiryDate = result.expiryDate || null
  if (!result.valid) {
    const message = result.expired
      ? `License has expired on ${result.expiryDate?.toLocaleDateString?.() || 'unknown date'}.\n\nPlease contact support for a renewal.`
      : 'No valid license found. Please install with a valid prefix-days license (e.g., BJ-60).'
    dialog.showErrorBox('License Error', message)
    app.quit()
    return false
  }
  // Do not show modal warning; renderer will display header banner
  return true
}

// Periodic license check
function startPeriodicLicenseCheck() {
  if (licenseCheckInterval) clearInterval(licenseCheckInterval)
  licenseCheckInterval = setInterval(() => {
    const result = getLicenseInfo()
    try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('license:status', result) } catch {}
    if (!result.valid) {
      dialog.showErrorBox('License Expired', 'Your license has expired. The application will now close.')
      app.quit()
    }
  }, 60 * 60 * 1000) // Every hour
}

// IPC handlers for license
ipcMain.handle('license:getStatus', async () => {
  return getLicenseInfo()
})

ipcMain.handle('license:getKey', async () => {
  return getLicenseKey()
})

// =========================
// Theme control (independent of system)
// =========================
// Default to light theme, independent of system theme
const defaultTheme = 'light'
let currentTheme = defaultTheme

function applyTheme(theme) {
  currentTheme = theme
  nativeTheme.themeSource = theme // 'light', 'dark', or 'system'
}

// Initialize theme on app ready
applyTheme(defaultTheme)

ipcMain.handle('theme:get', async () => currentTheme)
ipcMain.handle('theme:set', async (_event, theme) => {
  if (['light', 'dark'].includes(theme)) {
    applyTheme(theme)
    return { ok: true, theme: currentTheme }
  }
  return { ok: false, error: 'Invalid theme' }
})

// Suppress Autofill-related DevTools protocol calls that aren't supported in this Chromium build
// This prevents noisy console errors like: 'Autofill.enable' wasn't found
try {
  app.commandLine.appendSwitch('disable-features', [
    'AutofillServerCommunication',
    'AutofillCreditCardUpload',
    'AutofillEnableAccountWalletStorage',
    'AutofillAddressProfileSavePrompt',
    'Autofill'
  ].join(','))
} catch {}

function createWindow() {
  const isDev = !!process.env.VITE_DEV_SERVER_URL
  const iconPath = path.join(__dirname, '..', 'icon.ico')
  const appIcon = nativeImage.createFromPath(iconPath)
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Epic ePOS",
    icon: appIcon,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    show: false,
  })

// =========================
// Backup helpers (IPC)
// =========================
ipcMain.handle('backup:select-folder', async () => {
  try {
    const win = BrowserWindow.getFocusedWindow() || mainWindow
    if (!win) return ''
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
    if (res.canceled || !res.filePaths || !res.filePaths[0]) return ''
    return res.filePaths[0]
  } catch { return '' }
})

ipcMain.handle('backup:save', async (_event, { folderPath, fileName, data }) => {
  try {
    if (!folderPath) throw new Error('No folderPath')
    const base = String(folderPath)
    const name = String(fileName || `rms-backup-${new Date().toISOString().replace(/[:]/g, '-').slice(0,19)}.json`)
    const full = path.join(base, name)
    await fsp.mkdir(base, { recursive: true })
    await fsp.writeFile(full, typeof data === 'string' ? data : JSON.stringify(data), 'utf8')
    return { ok: true, path: full }
  } catch (e) { return { ok: false, error: String(e && e.message || e) } }
})

ipcMain.handle('backup:open-file', async () => {
  try {
    const win = BrowserWindow.getFocusedWindow() || mainWindow
    if (!win) return ''
    const res = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (res.canceled || !res.filePaths || !res.filePaths[0]) return ''
    return res.filePaths[0]
  } catch { return '' }
})

ipcMain.handle('backup:read', async (_event, { fullPath }) => {
  try {
    if (!fullPath) return ''
    const text = await fsp.readFile(String(fullPath), 'utf8')
    return text
  } catch { return '' }
})

  mainWindow.once('ready-to-show', () => {
    mainWindow.setTitle("Epic ePOS")
    try { mainWindow.setIcon(appIcon) } catch {}
    mainWindow.show()
    try { mainWindow.webContents.send('license:status', getLicenseInfo()) } catch {}
  })

  // Prevent HTML page title from overriding window title
  mainWindow.webContents.on('page-title-updated', (e) => {
    e.preventDefault()
    mainWindow.setTitle("Epic ePOS")
  })

  // Filter out DevTools-originated Autofill console noise
  try {
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      if (String(sourceId||'').startsWith('devtools://') && /Autofill\./i.test(String(message||''))) {
        return // swallow autofill protocol noise
      }
      // Forward other console messages to main process log (optional)
      if (level >= 2) {
        console.warn('[renderer]', message)
      } else {
        console.log('[renderer]', message)
      }
    })
  } catch {}

  if (isDev) {
    const url = process.env.VITE_DEV_SERVER_URL
    mainWindow.loadURL(url)
    if (process.env.OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  } else {
    // In production, start the bundled API server so renderer can call http://localhost:5000
    // Use dynamic import to support ESM server entry.
    (async () => {
      const startViaImport = async (entryPath) => {
        const url = pathToFileURL(entryPath).href
        await import(url)
        console.log('[main] Started server via import:', entryPath)
      }
      try {
        const prodServerEntry = path.join(process.resourcesPath, 'app', 'server', 'src', 'index.js')
        if (fs.existsSync(prodServerEntry)) {
          await startViaImport(prodServerEntry)
        } else {
          throw new Error('Prod server entry not found at ' + prodServerEntry)
        }
      } catch (e) {
        try {
          // Fallback for unpacked builds run directly from source tree
          const devServerEntry = path.join(__dirname, '..', 'server', 'src', 'index.js')
          if (fs.existsSync(devServerEntry)) {
            await startViaImport(devServerEntry)
          } else {
            throw new Error('Dev server entry not found at ' + devServerEntry)
          }
        } catch (e2) {
          console.warn('[main] Failed to start server', (e && e.message) || e, '->', (e2 && e2.message) || e2)
        }
      }
    })()
    const index = path.join(__dirname, '..', 'dist', 'index.html')
    try {
      const fileUrl = pathToFileURL(index).href
      mainWindow.loadURL(fileUrl)
    } catch (e) {
      console.warn('[main] Failed to load index via file URL, falling back to loadFile:', e && e.message || e)
      try { mainWindow.loadFile(index) } catch (e2) { console.error('[main] loadFile failed:', e2 && e2.message || e2) }
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Diagnostics: log load failures which can result in a blank window
  try {
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      console.error('[main] did-fail-load', { errorCode, errorDescription, validatedURL, isMainFrame })
    })
  } catch {}
}

app.on('ready', () => {
  // Set AppUserModelID so Windows taskbar shows our icon instead of electron.exe default
  try { app.setAppUserModelId('com.oresto.rms') } catch {}
  // Skip license check in development mode
  const isDev = !app.isPackaged || process.env.VITE_DEV_SERVER_URL
  if (!isDev) {
    // Check license before starting - blocks if invalid/expired
    if (!checkLicenseBlocking()) return
    // Start periodic license validation
    startPeriodicLicenseCheck()
  } else {
    console.log('[main] Development mode - skipping license check')
  }
  
  // Create main window
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) createWindow()
})

// Lazy-load printer to avoid optional dep issues in dev
try { printer = require('printer') } catch {}

// IPC: raw text print to specific device
ipcMain.handle('printing:raw', async (_event, { text, deviceName }) => {
  return new Promise((resolve) => {
    if (!printer || !text) return resolve({ ok: false, error: 'printer module not available' })
    try {
      printer.printDirect({
        data: String(text),
        printer: deviceName || undefined,
        type: 'RAW',
        success: jobID => resolve({ ok: true, jobID }),
        error: err => resolve({ ok: false, error: String(err) }),
      })
    } catch (e) {
      resolve({ ok: false, error: String(e && e.message || e) })
    }
  })
})

// IPC: list printers (for settings UI)
ipcMain.handle('printing:list', async () => {
  try {
    const win = BrowserWindow.getFocusedWindow() || mainWindow
    if (!win) return []
    let list = []
    try {
      if (typeof win.webContents.getPrintersAsync === 'function') {
        list = await win.webContents.getPrintersAsync()
      } else if (typeof win.webContents.getPrinters === 'function') {
        list = win.webContents.getPrinters()
      }
    } catch {}
    if (!Array.isArray(list) || list.length === 0) {
      try {
        if (printer && typeof printer.getPrinters === 'function') {
          const pList = printer.getPrinters() || []
          list = pList.map(p => ({ name: p.name || p.deviceName || '', deviceName: p.deviceName || p.name || '', isDefault: Boolean(p.isDefault || p.default) }))
        }
      } catch {}
    }
    return Array.isArray(list) ? list : []
  } catch { return [] }
})

// IPC: print provided HTML silently to a named device (no native deps)
ipcMain.handle('printing:print-html', async (_event, { html, deviceName }) => {
  try {
    const printWin = new BrowserWindow({ show: false })
    await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(String(html || '')))
    await new Promise((resolve) => setTimeout(resolve, 50))
    await new Promise((resolve, reject) => {
      printWin.webContents.print({ silent: true, deviceName: deviceName || undefined }, (success, failureReason) => {
        try { printWin.close() } catch {}
        if (!success) reject(new Error(failureReason || 'print failed'))
        else resolve()
      })
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) }
  }
})
