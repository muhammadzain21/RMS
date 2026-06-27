// Electron main process
// Loads Vite dev server in development (VITE_DEV_SERVER_URL), or the built index.html in production.

const { app, BrowserWindow, ipcMain, dialog, nativeTheme } = require('electron')
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
function getLicenseKey() {
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
        
        // Try to decrypt first (NSIS XOR encryption with secret "PIZZABAR2024")
        const decrypted = xorDecryptSimple(raw, 'PIZZABAR2024')
        if (decrypted && decrypted.startsWith('PIZZA-')) {
          return decrypted.toUpperCase()
        }
        
        // Fallback: check if it's already plain text (legacy or dev)
        if (raw.toUpperCase().startsWith('PIZZA-')) {
          return raw.toUpperCase()
        }
      }
    } catch {}
  }
  
  return null
}

// Validate license key
function validateLicense(key) {
  if (!key || typeof key !== 'string') {
    return { valid: false, error: 'No license key' }
  }
  
  key = key.trim().toUpperCase()
  
  // Check format
  const parts = key.split('-')
  if (parts.length !== 5 || parts[0] !== 'PIZZA') {
    return { valid: false, error: 'Invalid format' }
  }
  
  // Check demo keys with embedded dates
  if (key === 'PIZZA-PERMANENT-LICENSE-KEY0') {
    return { valid: true, expiryDate: null, daysRemaining: Infinity }
  }
  
  // Extract date from keys like PIZZA-2025-0131-DEMO-7DAY
  const year = parts[1]
  const monthDay = parts[2]
  if (year && monthDay && year.length === 4 && monthDay.length === 4) {
    const expiryDate = new Date(`${year}-${monthDay.slice(0, 2)}-${monthDay.slice(2, 4)}T23:59:59`)
    const now = new Date()
    
    if (now > expiryDate) {
      return { valid: false, error: 'License expired', expired: true, expiryDate }
    }
    
    const daysRemaining = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24))
    return { valid: true, expiryDate, daysRemaining }
  }
  
  // For custom keys, check length and format only
  if (key.length === 24) {
    // Assume valid for now (production would decode expiry from last part)
    return { valid: true, expiryDate: null, daysRemaining: Infinity }
  }
  
  return { valid: false, error: 'Invalid key length' }
}

// Check license and show blocking dialog if invalid
function checkLicenseBlocking() {
  const key = getLicenseKey()
  const result = validateLicense(key)
  
  licenseValid = result.valid
  licenseExpiryDate = result.expiryDate
  
  if (!result.valid) {
    const message = result.expired 
      ? `License has expired on ${result.expiryDate?.toLocaleDateString?.() || 'unknown date'}.\n\nPlease contact support for a renewal.`
      : 'No valid license key found or invalid format.\n\nPlease install the application with a valid license key.'
    
    dialog.showErrorBox('License Error', message)
    app.quit()
    return false
  }
  
  // Show warning if license expires soon
  if (result.daysRemaining && result.daysRemaining < 7 && result.daysRemaining !== Infinity) {
    dialog.showMessageBoxSync({
      type: 'warning',
      title: 'License Expiring Soon',
      message: `Your license will expire in ${result.daysRemaining} day${result.daysRemaining === 1 ? '' : 's'}.`,
      buttons: ['OK']
    })
  }
  
  return true
}

// Periodic license check
function startPeriodicLicenseCheck() {
  if (licenseCheckInterval) clearInterval(licenseCheckInterval)
  
  // Check every hour
  licenseCheckInterval = setInterval(() => {
    const key = getLicenseKey()
    const result = validateLicense(key)
    
    if (!result.valid) {
      dialog.showErrorBox('License Expired', 'Your license has expired. The application will now close.')
      app.quit()
    }
  }, 60 * 60 * 1000) // Every hour
}

// IPC handlers for license
ipcMain.handle('license:getStatus', async () => {
  const key = getLicenseKey()
  return validateLicense(key)
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
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Uncle John's Cafe",
    icon: path.join(__dirname, '..', 'icon.ico'),
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
    mainWindow.setTitle("Uncle John's Cafe")
    mainWindow.show()
  })

  // Prevent HTML page title from overriding window title
  mainWindow.webContents.on('page-title-updated', (e) => {
    e.preventDefault()
    mainWindow.setTitle("Uncle John's Cafe")
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
