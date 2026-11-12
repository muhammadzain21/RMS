// Electron main process
// Loads Vite dev server in development (VITE_DEV_SERVER_URL), or the built index.html in production.

const { app, BrowserWindow, ipcMain, dialog, nativeTheme, nativeImage, shell } = require('electron')
const { execSync, execFile } = require('child_process')
const http = require('http')
const net = require('net')
const path = require('path')
const fs = require('fs')
const fsp = require('fs').promises
const { pathToFileURL } = require('url')
let printer

/** Cache Windows printer → LAN IP so rush KOT prints stay sub-second */
const printerHostCache = new Map()

function looksLikeIpv4(s) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(s || '').trim())
}

function sendEscPosTcp(host, port, data) {
  return new Promise((resolve) => {
    const h = String(host || '').trim()
    const p = Number(port) || 9100
    if (!h || !data) return resolve({ ok: false, error: 'missing host or data' })
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'binary')
    const socket = net.connect({ host: h, port: p })
    let settled = false
    const done = (result) => {
      if (settled) return
      settled = true
      try { socket.destroy() } catch {}
      resolve(result)
    }
    socket.setTimeout(700)
    socket.on('connect', () => {
      socket.write(buf, (err) => {
        if (err) return done({ ok: false, error: String(err.message || err) })
        try { socket.end() } catch {}
        done({ ok: true, host: h, port: p, bytes: buf.length })
      })
    })
    socket.on('timeout', () => done({ ok: false, error: 'tcp timeout' }))
    socket.on('error', (e) => done({ ok: false, error: String(e && e.message || e) }))
  })
}

async function resolvePrinterHost(deviceName, explicitHost) {
  const direct = String(explicitHost || '').trim()
  if (looksLikeIpv4(direct)) return direct
  const name = String(deviceName || '').trim()
  if (!name) return ''
  if (looksLikeIpv4(name)) return name
  if (printerHostCache.has(name)) return printerHostCache.get(name)
  try {
    const safe = name.replace(/'/g, "''")
    const stdout = await new Promise((resolve, reject) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', `(Get-Printer -Name '${safe}' -ErrorAction Stop).PortName`],
        { timeout: 4000, windowsHide: true },
        (err, out) => (err ? reject(err) : resolve(String(out || '')))
      )
    })
    const m = String(stdout).match(/(\d{1,3}(?:\.\d{1,3}){3})/)
    const ip = m ? m[1] : ''
    if (ip) printerHostCache.set(name, ip)
    return ip
  } catch {
    return ''
  }
}

function waitForLocalServer(port = 5000, attempts = 80) {
  return new Promise((resolve) => {
    let n = 0
    const tick = () => {
      const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
        res.resume()
        resolve(true)
      })
      req.on('error', () => {
        if (++n >= attempts) return resolve(false)
        setTimeout(tick, 250)
      })
      req.setTimeout(1500, () => {
        try { req.destroy() } catch {}
      })
    }
    tick()
  })
}

// Default “actual size” for POS readability on typical displays (Ctrl+0 resets here).
const DEFAULT_ZOOM_FACTOR = 0.67
// Bump when the default changes so old saved 100% prefs are migrated once.
const ZOOM_STORE_VERSION = 2

function zoomStorePath() {
  try { return path.join(app.getPath('userData'), 'window-zoom.json') } catch { return '' }
}

function loadSavedZoomFactor() {
  try {
    const p = zoomStorePath()
    if (!p || !fs.existsSync(p)) {
      saveZoomFactor(DEFAULT_ZOOM_FACTOR)
      return DEFAULT_ZOOM_FACTOR
    }
    const j = JSON.parse(fs.readFileSync(p, 'utf8'))
    const ver = Number(j?.v) || 0
    // Migrate pre-v2 stores (usually stuck at 1.0 / 100%) to the new default once
    if (ver < ZOOM_STORE_VERSION) {
      saveZoomFactor(DEFAULT_ZOOM_FACTOR)
      return DEFAULT_ZOOM_FACTOR
    }
    const z = Number(j?.zoomFactor)
    if (Number.isFinite(z) && z >= 0.5 && z <= 3) return z
  } catch {}
  saveZoomFactor(DEFAULT_ZOOM_FACTOR)
  return DEFAULT_ZOOM_FACTOR
}

function saveZoomFactor(factor) {
  try {
    const z = Number(factor)
    if (!Number.isFinite(z) || z < 0.5 || z > 3) return
    const p = zoomStorePath()
    if (!p) return
    fs.writeFileSync(p, JSON.stringify({ v: ZOOM_STORE_VERSION, zoomFactor: z }), 'utf8')
  } catch {}
}

function applySavedZoom(win) {
  if (!win || win.isDestroyed()) return
  try {
    const z = loadSavedZoomFactor()
    win.webContents.setZoomFactor(z)
    // Also set zoom level for Chromium paths that ignore zoomFactor briefly on load
    try {
      const level = Math.log(z) / Math.log(1.2)
      if (Number.isFinite(level)) win.webContents.setZoomLevel(level)
    } catch {}
  } catch {}
}

function persistCurrentZoom(win) {
  if (!win || win.isDestroyed()) return
  try {
    saveZoomFactor(win.webContents.getZoomFactor())
  } catch {}
}

function wireZoomPersistence(win) {
  if (!win || win.isDestroyed()) return
  const restore = () => applySavedZoom(win)
  const persist = () => persistCurrentZoom(win)

  // Restore after every load/reload so zoom matches last session
  // (retry briefly — Chromium can reset zoom during first paint)
  const restoreSoon = () => {
    restore()
    setTimeout(restore, 50)
    setTimeout(restore, 250)
    setTimeout(restore, 800)
  }
  win.webContents.on('did-finish-load', restoreSoon)
  win.webContents.on('dom-ready', restoreSoon)
  win.webContents.on('did-navigate', restoreSoon)
  win.webContents.on('did-navigate-in-page', restoreSoon)

  // Persist when user zooms (Ctrl +/- / Ctrl+scroll / menu)
  try {
    win.webContents.on('zoom-changed', persist)
  } catch {}

  // Fallback: catch keyboard zoom shortcuts
  win.webContents.on('before-input-event', (event, input) => {
    if (!input || input.type !== 'keyDown') return
    const key = String(input.key || '')
    const zoomKey = input.control || input.meta
    if (!zoomKey) return
    // Ctrl/Cmd+0 → reset to our default actual size (67%), not browser 100%
    if (key === '0' || key === 'Numpad0') {
      try {
        event.preventDefault()
        win.webContents.setZoomFactor(DEFAULT_ZOOM_FACTOR)
        saveZoomFactor(DEFAULT_ZOOM_FACTOR)
      } catch {}
      return
    }
    if (key === '=' || key === '+' || key === '-' || key === '_' || key === 'NumpadAdd' || key === 'NumpadSubtract') {
      setTimeout(persist, 50)
    }
  })

  win.on('close', persist)
  win.on('blur', persist)
}

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

// Read license value from HKCU\Software\PizzaBar registry (set by installer or activation dialog)
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

function getLicenseKey() {
  // Registry only — no license file is read from the app location
  const fromReg = readRegValue('LicenseKey')
  if (fromReg) return String(fromReg).toUpperCase()
  return null
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

// Check license — never quits; renderer shows a blocking dialog to enter a new key
function checkLicenseBlocking() {
  const result = getLicenseInfo()
  licenseValid = !!result.valid
  licenseExpiryDate = result.expiryDate || null
  return true
}

// Periodic license check — broadcasts status; expired state is handled by the
// renderer's license gate (re-entry dialog) instead of force-quitting
function startPeriodicLicenseCheck() {
  if (licenseCheckInterval) clearInterval(licenseCheckInterval)
  licenseCheckInterval = setInterval(() => {
    const result = getLicenseInfo()
    try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('license:status', result) } catch {}
  }, 60 * 60 * 1000) // Every hour
}

// IPC handlers for license
ipcMain.handle('license:getStatus', async () => {
  return { ...getLicenseInfo(), dev: !app.isPackaged }
})

ipcMain.handle('license:getKey', async () => {
  return getLicenseKey()
})

// Activate a new license key without reinstalling.
// Accepts PREFIX-DAYS keys (e.g., BJ-60) and legacy PIZZA-* keys.
ipcMain.handle('license:activate', async (_event, key) => {
  try {
    const k = String(key || '').trim().toUpperCase()
    if (!k) return { ok: false, error: 'Enter a license key' }

    const m = k.match(/^([A-Z]{2,5})[-:](\d{1,4})$/)
    if (m) {
      // PREFIX-DAYS: expiry counts from activation date
      writeRegValue('LicenseKey', k)
      writeRegValue('LicensePrefix', m[1])
      writeRegValue('LicenseDays', m[2])
      writeRegValue('LicenseInstallDate', new Date().toISOString().slice(0, 10))
    } else {
      // Legacy PIZZA-* key: clear days config so the key itself is authoritative
      const v = validateLegacyKey(k)
      if (!v.valid) return { ok: false, error: v.error || 'Invalid license key' }
      writeRegValue('LicenseKey', k)
      deleteRegValue('LicensePrefix')
      deleteRegValue('LicenseDays')
      deleteRegValue('LicenseInstallDate')
    }

    const status = { ...getLicenseInfo(), dev: !app.isPackaged }
    try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('license:status', status) } catch {}
    if (!status.valid) return { ok: false, error: 'License expired or invalid', status }
    return { ok: true, status }
  } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
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
  const initialZoom = loadSavedZoomFactor()
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    "title": "EpicSpire",
    icon: appIcon,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      // Apply before first paint so Login (and every later page) starts at default zoom
      zoomFactor: initialZoom,
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

  wireZoomPersistence(mainWindow)
  applySavedZoom(mainWindow)

  mainWindow.once('ready-to-show', () => {
    mainWindow.setTitle("EpicSpire")
    try { mainWindow.setIcon(appIcon) } catch {}
    applySavedZoom(mainWindow)
    mainWindow.show()
    try { mainWindow.webContents.send('license:status', getLicenseInfo()) } catch {}
  })

  // Prevent HTML page title from overriding window title
  mainWindow.webContents.on('page-title-updated', (e) => {
    e.preventDefault()
    mainWindow.setTitle("EpicSpire")
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
    // Start bundled API+UI server, then load http://127.0.0.1:5000 (not file://).
    // Absolute /assets paths work on nested routes and match LAN browser access.
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

      const ok = await waitForLocalServer(5000)
      if (ok) {
        try {
          await mainWindow.loadURL('http://127.0.0.1:5000/')
          return
        } catch (loadErr) {
          console.warn('[main] Failed to load http://127.0.0.1:5000/', loadErr && loadErr.message || loadErr)
        }
      }
      // Fallback: packaged dist via file URL (HashRouter / relative assets may apply)
      const index = path.join(__dirname, '..', 'dist', 'index.html')
      try {
        await mainWindow.loadURL(pathToFileURL(index).href)
      } catch (e) {
        try { mainWindow.loadFile(index) } catch (e2) {
          console.error('[main] loadFile failed:', e2 && e2.message || e2)
        }
      }
    })()
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
  try { app.setAppUserModelId('com.epicspire.rms') } catch {}
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

// Fast path: ESC/POS bytes straight to thermal LAN port 9100 (no Chromium / HTML / PDF)
ipcMain.handle('printing:escpos', async (_event, { text, deviceName, host, port }) => {
  try {
    const payload = text == null ? '' : String(text)
    if (!payload) return { ok: false, error: 'empty payload' }
    const resolved = await resolvePrinterHost(deviceName, host)
    if (resolved) {
      const tcp = await sendEscPosTcp(resolved, port || 9100, payload)
      if (tcp.ok) return tcp
      console.warn('[print] escpos tcp failed:', tcp.error, '| host:', resolved)
    }
    // Fallback: Windows RAW spooler (still much faster than HTML)
    if (printer && deviceName) {
      return await new Promise((resolve) => {
        try {
          printer.printDirect({
            data: payload,
            printer: deviceName,
            type: 'RAW',
            success: (jobID) => resolve({ ok: true, jobID, via: 'spooler' }),
            error: (err) => resolve({ ok: false, error: String(err) }),
          })
        } catch (e) {
          resolve({ ok: false, error: String(e && e.message || e) })
        }
      })
    }
    return { ok: false, error: resolved ? 'tcp failed' : 'no printer host' }
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) }
  }
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

// IPC: print HTML in a dedicated window (never mainWindow — window.print() on the
// POS shell breaks Electron layout / 100dvh after the dialog closes).
// Interactive (silent:false): window must be shown briefly or Windows hides the picker.
ipcMain.handle('printing:print-html', async (_event, { html, deviceName, silent }) => {
  const useSilent = silent === true || (silent !== false && !!deviceName)
  const printWin = new BrowserWindow({
    show: false,
    width: 420,
    height: 640,
    autoHideMenuBar: true,
    skipTaskbar: true,
    webPreferences: { backgroundThrottling: false },
  })
  try {
    await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(String(html || '')))
    // Brief settle for layout; thermal slips are text-only so keep this short
    await new Promise((r) => setTimeout(r, 40))
    if (!useSilent) {
      try {
        printWin.center()
        printWin.show()
        printWin.focus()
      } catch {}
    }
    const result = await new Promise((resolve) => {
      try {
        printWin.webContents.print(
          {
            silent: useSilent,
            printBackground: true,
            margins: { marginType: 'none' },
            deviceName: deviceName || undefined,
          },
          (success, failureReason) => resolve({ success: !!success, failureReason })
        )
      } catch (e) {
        resolve({ success: false, failureReason: String(e && e.message || e) })
      }
    })
    if (!result.success) {
      console.error('[print] print-html failed:', result.failureReason || 'unknown', '| device:', deviceName, '| silent:', useSilent)
      return { ok: false, error: result.failureReason || 'print failed' }
    }
    return { ok: true }
  } catch (e) {
    console.error('[print] print-html error:', e && e.message || e)
    return { ok: false, error: String(e && e.message || e) }
  } finally {
    try { printWin.destroy() } catch {}
    // Re-apply zoom on the POS window — print dialogs can leave Chromium zoom/layout odd
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        applySavedZoom(mainWindow)
        try { mainWindow.focus() } catch {}
      }
    } catch {}
  }
})

// Shared: open a PDF file in an in-app Chromium PDF viewer window;
// falls back to the system default PDF viewer if the window can't render it
const openPdfPreviewWindow = async (fullPath, fileName) => {
  const fileUrl = pathToFileURL(fullPath).toString()

  // Do NOT parent to mainWindow — modal child windows leave the POS shell
  // looking collapsed / half-blank on Windows after the preview closes.
  const previewWin = new BrowserWindow({
    width: 1000,
    height: 800,
    title: fileName,
    autoHideMenuBar: true,
    webPreferences: {
      plugins: true,          // enables Chromium's built-in PDF viewer
      sandbox: false,         // sandboxed renderers can't host the PDF extension (Electron 20+)
      contextIsolation: false,
      nodeIntegration: false,
    },
  })
  try {
    previewWin.on('closed', () => {
      try {
        if (mainWindow && !mainWindow.isDestroyed()) applySavedZoom(mainWindow)
      } catch {}
    })
  } catch {}

  const openExternal = async () => { try { await shell.openPath(fullPath) } catch {} }

  // Capture session once — never touch previewWin.webContents after destroy
  // (CSV/PDF saves share this session and would crash with "Object has been destroyed")
  let ses = null
  try { ses = previewWin.webContents.session } catch { ses = null }

  const onWillDownload = (_e, item, wc) => {
    try {
      if (!previewWin || previewWin.isDestroyed()) return
      let target = null
      try { target = previewWin.webContents } catch { return }
      if (wc === target) { try { item.cancel() } catch {} }
    } catch {}
  }
  if (ses) {
    try { ses.on('will-download', onWillDownload) } catch {}
  }
  const detachDownloadGuard = () => {
    try { if (ses) ses.removeListener('will-download', onWillDownload) } catch {}
  }
  try { previewWin.on('closed', detachDownloadGuard) } catch {}
  setTimeout(detachDownloadGuard, 30000)

  previewWin.webContents.once('did-fail-load', async () => {
    try { previewWin.destroy() } catch {}
    await openExternal()
  })
  await previewWin.loadURL(fileUrl)

  // If the PDF still ended up downloaded/blank instead of rendered,
  // open it in the OS default PDF viewer instead
  setTimeout(() => {
    try {
      if (previewWin.isDestroyed()) return
      const url = previewWin.webContents.getURL()
      if (!url || url === 'about:blank') { previewWin.destroy(); openExternal() }
    } catch {}
  }, 1500)
}

// IPC: preview a PDF (base64) in the in-app PDF viewer window
ipcMain.handle('preview:open-pdf', async (_event, { name, data }) => {
  try {
    if (!data) throw new Error('No PDF data')
    const fileName = /\.[Pp][Dd][Ff]$/.test(String(name || '')) ? String(name) : `preview-${Date.now()}.pdf`
    const fullPath = path.join(app.getPath('temp'), fileName)
    await fsp.writeFile(fullPath, Buffer.from(String(data), 'base64'))
    await openPdfPreviewWindow(fullPath, fileName)
    return { ok: true, path: fullPath }
  } catch (e) {
    console.error('[preview] open pdf failed:', e && e.message || e)
    return { ok: false, error: String(e && e.message || e) }
  }
})

async function renderHtmlToPdfBuffer(html) {
  const printWin = new BrowserWindow({
    show: false,
    webPreferences: { backgroundThrottling: false },
  })
  try {
    await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(String(html || '')))
    // preferCSSPageSize honors the report's own @page size/margins (A4, 12mm)
    return await printWin.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      preferCSSPageSize: true,
      margins: { marginType: 'default' },
    })
  } finally {
    try { printWin.destroy() } catch {}
  }
}

// IPC: render report HTML to an A4 PDF in a hidden window, then show the PDF preview
ipcMain.handle('preview:print-html', async (_event, { html, name }) => {
  try {
    const pdf = await renderHtmlToPdfBuffer(html)
    const fileName = /\.[Pp][Dd][Ff]$/.test(String(name || '')) ? String(name) : `report-${Date.now()}.pdf`
    const fullPath = path.join(app.getPath('temp'), fileName)
    await fsp.writeFile(fullPath, pdf)
    await openPdfPreviewWindow(fullPath, fileName)
    return { ok: true, path: fullPath }
  } catch (e) {
    console.error('[preview] html->pdf failed:', e && e.message || e)
    return { ok: false, error: String(e && e.message || e) }
  }
})

// IPC: same A4 HTML→PDF as print preview, but return base64 for a file download (no preview window)
ipcMain.handle('preview:download-html', async (_event, { html, name }) => {
  try {
    const pdf = await renderHtmlToPdfBuffer(html)
    const fileName = /\.[Pp][Dd][Ff]$/.test(String(name || '')) ? String(name) : `report-${Date.now()}.pdf`
    return { ok: true, fileName, base64: Buffer.from(pdf).toString('base64') }
  } catch (e) {
    console.error('[preview] html->pdf download failed:', e && e.message || e)
    return { ok: false, error: String(e && e.message || e) }
  }
})
