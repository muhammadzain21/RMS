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

/** Connect-only probe (no bytes written) for printer reachability checks. */
function probeTcpPort(host, port) {
  return new Promise((resolve) => {
    const h = String(host || '').trim()
    const p = Number(port) || 9100
    if (!h) return resolve({ ok: false, error: 'missing host' })
    const socket = net.connect({ host: h, port: p })
    let settled = false
    const done = (result) => {
      if (settled) return
      settled = true
      try { socket.destroy() } catch {}
      resolve(result)
    }
    socket.setTimeout(700)
    socket.on('connect', () => done({ ok: true, host: h, port: p }))
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
const { createLicenseSystem } = require('./license.cjs')
const licenseApi = createLicenseSystem({
  app,
  getMainWindow: () => mainWindow,
})
const {
  getLicenseInfo,
  getLicenseKey,
  checkLicenseBlocking,
  startPeriodicLicenseCheck,
} = licenseApi

ipcMain.handle('license:getStatus', async () => {
  return { ...getLicenseInfo(), dev: !app.isPackaged }
})

ipcMain.handle('license:getKey', async () => {
  return getLicenseKey()
})

ipcMain.handle('license:activate', async (_event, key) => {
  try {
    return licenseApi.activate(key)
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
  if (process.platform !== 'darwin') {
    try { if (licenseCheckInterval) clearInterval(licenseCheckInterval) } catch {}
    app.quit()
    // Embedded API server can keep the event loop alive; force exit so
    // Windows installers can replace files without a manual uninstall.
    setTimeout(() => {
      try { process.exit(0) } catch {}
    }, 1200)
  }
})

app.on('before-quit', () => {
  try { if (licenseCheckInterval) clearInterval(licenseCheckInterval) } catch {}
  setTimeout(() => {
    try { process.exit(0) } catch {}
  }, 2000)
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

// Fast path: ESC/POS bytes straight to thermal LAN port 9100 (no Chromium / HTML / PDF).
// Only when an explicit LAN IP is provided. Do NOT fall back to Windows RAW spooler —
// RAW ESC/POS on a normal Windows printer driver prints a tiny blank slip.
ipcMain.handle('printing:escpos', async (_event, { text, host, port }) => {
  try {
    const payload = text == null ? '' : String(text)
    if (!payload) return { ok: false, error: 'empty payload' }
    const explicit = String(host || '').trim()
    if (!looksLikeIpv4(explicit)) {
      return { ok: false, error: 'no printer host' }
    }
    const tcp = await sendEscPosTcp(explicit, port || 9100, payload)
    if (tcp.ok) return tcp
    console.warn('[print] escpos tcp failed:', tcp.error, '| host:', explicit)
    return { ok: false, error: tcp.error || 'tcp failed', host: explicit }
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) }
  }
})

async function listSystemPrinters() {
  try {
    const win = BrowserWindow.getFocusedWindow() || mainWindow
    let list = []
    if (win) {
      try {
        if (typeof win.webContents.getPrintersAsync === 'function') {
          list = await win.webContents.getPrintersAsync()
        } else if (typeof win.webContents.getPrinters === 'function') {
          list = win.webContents.getPrinters()
        }
      } catch {}
    }
    if (!Array.isArray(list) || list.length === 0) {
      try {
        if (printer && typeof printer.getPrinters === 'function') {
          const pList = printer.getPrinters() || []
          list = pList.map(p => ({
            name: p.name || p.deviceName || '',
            displayName: p.name || p.deviceName || '',
            deviceName: p.deviceName || p.name || '',
            isDefault: Boolean(p.isDefault || p.default),
            status: p.status,
          }))
        }
      } catch {}
    }
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function normalizePrinterKey(s) {
  return String(s || '').trim().toLowerCase()
}

async function getWindowsPrinterInfo(deviceName) {
  const name = String(deviceName || '').trim()
  if (!name) return null
  try {
    const safe = name.replace(/'/g, "''")
    const stdout = await new Promise((resolve, reject) => {
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `$p = Get-Printer -Name '${safe}' -ErrorAction Stop; [pscustomobject]@{ Name=$p.Name; PrinterStatus=[string]$p.PrinterStatus; PortName=$p.PortName; JobCount=$p.JobCount } | ConvertTo-Json -Compress`,
        ],
        { timeout: 5000, windowsHide: true },
        (err, out) => (err ? reject(err) : resolve(String(out || ''))),
      )
    })
    const parsed = JSON.parse(String(stdout || '').trim() || 'null')
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function classifyPrinterStatus(statusText, chromeStatus) {
  const s = String(statusText || '').toLowerCase()
  if (/offline|error|not.?available|door.?open|paper.?out|paused|jam/.test(s)) {
    return { reachable: false, label: statusText || 'Offline / error' }
  }
  if (/normal|idle|printing|warmup|busy|pending|ready/.test(s)) {
    return { reachable: true, label: statusText || 'Ready' }
  }
  // Chromium printer status: 0 often means idle/OK
  if (chromeStatus === 0 || chromeStatus === '0') {
    return { reachable: true, label: 'Installed' }
  }
  if (statusText) return { reachable: true, label: String(statusText) }
  return { reachable: true, label: 'Found on this PC' }
}

// IPC: list printers (for settings UI)
ipcMain.handle('printing:list', async () => {
  try {
    return await listSystemPrinters()
  } catch {
    return []
  }
})

/**
 * Check whether a saved Windows printer name (and optional LAN IP) is installed / reachable.
 * Body: { deviceName?: string, host?: string, port?: number }
 */
ipcMain.handle('printing:check', async (_event, opts = {}) => {
  try {
    const deviceName = String(opts.deviceName || opts.name || '').trim()
    const hostIn = String(opts.host || opts.ip || '').trim()
    const port = Number(opts.port) || 9100
    if (!deviceName && !hostIn) {
      return { ok: false, found: false, reachable: false, message: 'No printer name or IP' }
    }

    const list = await listSystemPrinters()
    const key = normalizePrinterKey(deviceName)
    const match = key
      ? list.find((p) => {
        const n = normalizePrinterKey(p.name || p.displayName || p.deviceName)
        const d = normalizePrinterKey(p.deviceName)
        return n === key || d === key
      })
      : null

    const winInfo = deviceName ? await getWindowsPrinterInfo(deviceName) : null
    const statusText = winInfo?.PrinterStatus || (match ? 'Installed' : '')
    const classified = match || winInfo
      ? classifyPrinterStatus(statusText, match?.status)
      : { reachable: false, label: 'Not found on this PC' }

    let host = looksLikeIpv4(hostIn) ? hostIn : ''
    if (!host && deviceName) {
      host = await resolvePrinterHost(deviceName, '')
    }
    if (!host && winInfo?.PortName) {
      const m = String(winInfo.PortName).match(/(\d{1,3}(?:\.\d{1,3}){3})/)
      if (m) host = m[1]
    }

    let tcpOk = null
    let tcpError = ''
    if (host) {
      const probe = await probeTcpPort(host, port)
      tcpOk = Boolean(probe.ok)
      if (!probe.ok) tcpError = probe.error || 'tcp failed'
    }

    const found = Boolean(match || winInfo)
    const reachable = found
      ? (tcpOk === false ? false : classified.reachable)
      : (tcpOk === true)

    let message = ''
    if (!deviceName && host) {
      message = tcpOk ? `Network printer ${host} reachable` : `Network printer ${host} not reachable`
    } else if (!found) {
      message = tcpOk
        ? `Name not in Windows printers, but ${host}:${port} responds`
        : `Printer "${deviceName}" not found on this PC — paste the exact name from Devices and Printers`
    } else if (tcpOk === false && host) {
      message = `Installed (${classified.label}) but ${host}:${port} not reachable`
    } else if (tcpOk === true) {
      message = `Connected · ${classified.label} · ${host}:${port} OK`
    } else {
      message = classified.reachable
        ? `Connected · ${classified.label}`
        : `Found but ${classified.label}`
    }

    return {
      ok: true,
      found,
      reachable: Boolean(reachable),
      status: classified.label,
      portName: winInfo?.PortName || '',
      host: host || '',
      tcpOk,
      tcpError,
      deviceName: match?.name || match?.deviceName || deviceName,
      message,
    }
  } catch (e) {
    return { ok: false, found: false, reachable: false, message: String(e && e.message || e) }
  }
})

function resolvePdfToPrinter() {
  const candidates = [
    path.join(__dirname, '..', 'server', 'node_modules', 'pdf-to-printer'),
    process.resourcesPath ? path.join(process.resourcesPath, 'app', 'server', 'node_modules', 'pdf-to-printer') : '',
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      const sumatraPdfPath = path.join(candidate, 'dist', 'SumatraPDF-3.4.6-32.exe')
      if (!fs.existsSync(sumatraPdfPath)) continue
      const mod = require(candidate)
      const print = mod && (mod.print || (mod.default && mod.default.print))
      if (typeof print === 'function') return { print, sumatraPdfPath }
    } catch (e) {
      console.warn('[print] pdf-to-printer load failed:', candidate, e && e.message || e)
    }
  }
  try {
    const mod = require('pdf-to-printer')
    const print = mod && (mod.print || (mod.default && mod.default.print))
    if (typeof print === 'function') return { print, sumatraPdfPath: '' }
  } catch {}
  return null
}

/**
 * Windows named thermal printers drop Chromium silent GDI jobs as a short blank feed.
 * The working path (browser) is a narrow PDF + pdf-to-printer. Do the same here, using
 * Electron's already-running Chromium so we don't pay a Puppeteer cold start.
 */
async function silentPrintHtmlPdf(html, printerName) {
  const ptp = resolvePdfToPrinter()
  if (!ptp) throw new Error('pdf-to-printer is not available')
  const printFn = ptp.print
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const tmp = app.getPath('temp')
  const htmlPath = path.join(tmp, `slip-${id}.html`)
  const pdfPath = path.join(tmp, `slip-${id}.pdf`)
  const printWin = new BrowserWindow({
    show: false,
    // ~80mm at 96dpi so the slip lays out at roll width before PDF
    width: 302,
    height: 1400,
    webPreferences: { backgroundThrottling: false },
  })
  try {
    await fsp.writeFile(htmlPath, String(html || ''), 'utf8')
    await new Promise((resolve, reject) => {
      const onFail = (_e, code, desc) => reject(new Error(desc || `load failed (${code})`))
      printWin.webContents.once('did-finish-load', () => resolve())
      printWin.webContents.once('did-fail-load', onFail)
      printWin.loadFile(htmlPath).catch(reject)
    })
    try {
      await printWin.webContents.insertCSS('html,body{width:72mm !important;max-width:72mm !important;margin:0 !important;background:#fff !important;}')
    } catch {}
    const measured = await printWin.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const finish = () => {
          const text = String((document.body && document.body.innerText) || '').trim()
          const h = Math.max(
            document.body ? document.body.scrollHeight : 0,
            document.documentElement ? document.documentElement.scrollHeight : 0,
            120
          )
          resolve({ chars: text.length, heightPx: h })
        }
        const kick = () => requestAnimationFrame(() => requestAnimationFrame(finish))
        if (document.fonts && document.fonts.ready) {
          Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 180))]).then(kick)
        } else kick()
      })
    `, true)
    if (!measured || !measured.chars) {
      throw new Error('Slip had no visible text')
    }
    // printToPDF pageSize is inches (not microns). 80000 here was a postage-stamp page.
    const widthIn = 80 / 25.4
    const heightIn = Math.min(24, Math.max(2.2, (Number(measured.heightPx || 400) / 96) + 0.35))
    const pdf = await printWin.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: false,
      pageSize: { width: widthIn, height: heightIn },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    })
    if (!pdf || !pdf.length) throw new Error('Empty slip PDF')
    await fsp.writeFile(pdfPath, pdf)
    await printFn(pdfPath, {
      printer: printerName,
      silent: true,
      scale: 'noscale',
      ...(ptp.sumatraPdfPath ? { sumatraPdfPath: ptp.sumatraPdfPath } : {}),
    })
    return { ok: true, deviceName: printerName, via: 'pdf' }
  } finally {
    try { if (printWin && !printWin.isDestroyed()) printWin.destroy() } catch {}
    setTimeout(() => {
      fsp.unlink(htmlPath).catch(() => {})
      fsp.unlink(pdfPath).catch(() => {})
    }, 8000)
  }
}

function resolveChromiumPrinterName(requested, list) {
  const want = String(requested || '').trim()
  if (!want) return ''
  const rows = Array.isArray(list) ? list : []
  const key = want.toLowerCase()
  const exact = rows.find((p) => {
    const n = String(p.name || '').trim()
    const d = String(p.displayName || p.deviceName || '').trim()
    return n === want || d === want
  })
  if (exact) return String(exact.name || exact.displayName || exact.deviceName || want).trim()
  const ci = rows.find((p) => {
    const n = String(p.name || '').trim().toLowerCase()
    const d = String(p.displayName || p.deviceName || '').trim().toLowerCase()
    return n === key || d === key
  })
  if (ci) return String(ci.name || ci.displayName || ci.deviceName || want).trim()
  const partial = rows.find((p) => {
    const n = String(p.name || '').trim().toLowerCase()
    const d = String(p.displayName || p.deviceName || '').trim().toLowerCase()
    return (n && (n.includes(key) || key.includes(n))) || (d && (d.includes(key) || key.includes(d)))
  })
  if (partial) return String(partial.name || partial.displayName || partial.deviceName || want).trim()
  return want
}

// IPC: print HTML in a dedicated window (never mainWindow — window.print() on the
// POS shell breaks Electron layout / 100dvh after the dialog closes).
// Interactive (silent:false): window must be shown briefly or Windows hides the picker.
ipcMain.handle('printing:print-html', async (_event, { html, deviceName, silent }) => {
  const useSilent = silent === true || (silent !== false && !!deviceName)
  let printWin = null
  let destroyDelayMs = 200
  try {
    const printers = await listSystemPrinters()
    const resolvedName = resolveChromiumPrinterName(deviceName, printers)
    if (deviceName && resolvedName !== String(deviceName).trim()) {
      console.log('[print] resolved printer name:', deviceName, '→', resolvedName)
    }
    if (useSilent && deviceName) {
      const known = printers.some((p) => {
        const n = String(p.name || p.displayName || p.deviceName || '').trim().toLowerCase()
        return n && (
          n === String(deviceName).trim().toLowerCase()
          || n === String(resolvedName).trim().toLowerCase()
        )
      })
      if (!known) {
        console.warn('[print] printer not in Chromium list:', deviceName, '| available:', printers.map(p => p.name || p.displayName).filter(Boolean))
        return {
          ok: false,
          error: `Printer "${deviceName}" not found. Pick the exact name from the Printers page list.`,
        }
      }
    }

    // Named silent jobs: 80mm PDF → Windows spooler (same idea as the browser path).
    // Do not fall back to GDI — that driver feeds a short blank strip.
    if (useSilent && resolvedName) {
      try {
        const pdfResult = await silentPrintHtmlPdf(html, resolvedName)
        try {
          if (mainWindow && !mainWindow.isDestroyed()) {
            applySavedZoom(mainWindow)
            mainWindow.focus()
          }
        } catch {}
        return pdfResult
      } catch (pdfErr) {
        const message = String(pdfErr && pdfErr.message || pdfErr || 'print failed')
        console.error('[print] PDF silent print failed:', message)
        return { ok: false, error: message }
      }
    }

    printWin = new BrowserWindow({
      show: false,
      width: 420,
      height: 640,
      autoHideMenuBar: true,
      skipTaskbar: true,
      webPreferences: { backgroundThrottling: false },
    })

    await new Promise((resolve, reject) => {
      const onFail = (e) => reject(e)
      printWin.webContents.once('did-finish-load', () => resolve())
      printWin.webContents.once('did-fail-load', (_e, code, desc) => onFail(new Error(desc || `load failed (${code})`)))
      const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const htmlPath = path.join(app.getPath('temp'), `slip-view-${fileId}.html`)
      fsp.writeFile(htmlPath, String(html || ''), 'utf8')
        .then(() => printWin.loadFile(htmlPath))
        .then(() => { setTimeout(() => fsp.unlink(htmlPath).catch(() => {}), 15000) })
        .catch(onFail)
    })
    await new Promise((r) => setTimeout(r, 200))

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
            // 80mm roll — letter/A4 GDI jobs come out as a blank feed on thermal drivers
            pageSize: useSilent ? { width: 80000, height: 200000 } : undefined,
            deviceName: resolvedName || undefined,
          },
          (success, failureReason) => resolve({ success: !!success, failureReason })
        )
      } catch (e) {
        resolve({ success: false, failureReason: String(e && e.message || e) })
      }
    })
    if (!result.success) {
      console.error('[print] print-html failed:', result.failureReason || 'unknown', '| device:', resolvedName || deviceName, '| silent:', useSilent)
      return { ok: false, error: result.failureReason || 'print failed' }
    }
    // Keep window alive briefly so the spooler receives the job
    destroyDelayMs = useSilent ? 1200 : 400
    return { ok: true, deviceName: resolvedName || deviceName || '' }
  } catch (e) {
    console.error('[print] print-html error:', e && e.message || e)
    return { ok: false, error: String(e && e.message || e) }
  } finally {
    const win = printWin
    setTimeout(() => {
      try { if (win && !win.isDestroyed()) win.destroy() } catch {}
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          applySavedZoom(mainWindow)
          try { mainWindow.focus() } catch {}
        }
      } catch {}
    }, destroyDelayMs)
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
