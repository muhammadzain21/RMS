import { Router } from 'express'
import os from 'os'
import path from 'path'
import net from 'net'
import { promises as fs } from 'fs'
import puppeteer from 'puppeteer'
import ptp from 'pdf-to-printer'
import { authRequired } from '../middleware/auth.js'
import { resolveBranchId } from '../utils/branchScope.js'
import { getSettingsLean } from '../utils/settingsScope.js'

const { print: printPdf, getPrinters } = ptp || {}
const router = Router()

router.use(authRequired)

function looksLikeIpv4(s) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(s || '').trim())
}

function sendEscPosTcp(host, port, data) {
  return new Promise((resolve) => {
    const h = String(host || '').trim()
    const p = Number(port) || 9100
    if (!h || data == null || data === '') return resolve({ ok: false, error: 'missing host or data' })
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

async function resolveKotPrintTarget(req, { type, printerName, host } = {}) {
  const branchId = (() => {
    try { return resolveBranchId(req) || '' } catch { return '' }
  })()
  const settings = await getSettingsLean(branchId).catch(() => null)
  const t = String(type || '').toLowerCase()
  let name = String(printerName || '').trim()
  let ip = String(host || '').trim()
  if (!name || !ip) {
    if (t === 'void') {
      name = name || settings?.voidPrinterName || settings?.kotPrinterName || ''
      ip = ip || settings?.voidPrinterIp || settings?.kotPrinterIp || ''
    } else if (t === 'kot') {
      name = name || settings?.kotPrinterName || ''
      ip = ip || settings?.kotPrinterIp || ''
    } else if (t === 'bill') {
      name = name || settings?.billPrinterName || ''
      ip = ip || settings?.billPrinterIp || ''
    }
  }
  if (!ip && looksLikeIpv4(name)) ip = name
  return { settings, printerName: name, host: ip }
}

/** Keep one Chromium and one page alive — launching per request is ~2s. */
let printBrowser = null
let printBrowserLaunch = null
let printPage = null
let printQueue = Promise.resolve()

function enqueuePrint(task) {
  const run = printQueue.then(task, task)
  printQueue = run.then(() => {}, () => {})
  return run
}

/** Call once at server boot so the first KOT/bill is not waiting on Chromium launch. */
export function warmPrintBrowser() {
  getPrintBrowser()
    .then(() => { try { console.log('[print] Chromium ready') } catch {} })
    .catch((e) => { try { console.warn('[print] Chromium warm failed:', e?.message || e) } catch {} })
}

async function getPrintBrowser() {
  if (printBrowser?.connected) return printBrowser
  if (printBrowserLaunch) return printBrowserLaunch
  printBrowserLaunch = puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none',
    ],
  }).then((browser) => {
    printBrowser = browser
    printBrowserLaunch = null
    browser.on('disconnected', () => {
      if (printBrowser === browser) printBrowser = null
      printPage = null
    })
    return browser
  }).catch((err) => {
    printBrowserLaunch = null
    throw err
  })
  return printBrowserLaunch
}

async function getPrintPage() {
  const browser = await getPrintBrowser()
  if (printPage && !printPage.isClosed()) return printPage
  printPage = await browser.newPage()
  await printPage.setViewport({ width: 302, height: 1400, deviceScaleFactor: 1 })
  return printPage
}

async function htmlToTempPdf(html) {
  const tmpDir = os.tmpdir()
  const fileBase = `print-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const pdfPath = path.join(tmpDir, `${fileBase}.pdf`)
  const page = await getPrintPage()
  try {
    // Slips are inline HTML — don't wait on network or webfonts
    await page.setContent(String(html || ''), { waitUntil: 'domcontentloaded', timeout: 4000 })
    const measured = await page.evaluate(() => {
      const text = String((document.body && document.body.innerText) || '').trim()
      const h = Math.max(
        document.body ? document.body.scrollHeight : 0,
        document.documentElement ? document.documentElement.scrollHeight : 0,
        160,
      )
      return { chars: text.length, heightPx: h }
    }).catch(() => ({ chars: 1, heightPx: 480 }))
    const heightMm = Math.min(600, Math.max(60, Math.ceil(Number(measured.heightPx || 240) * 25.4 / 96) + 10))
    await page.pdf({
      path: pdfPath,
      printBackground: true,
      preferCSSPageSize: false,
      width: '80mm',
      height: `${heightMm}mm`,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })
  } catch (err) {
    try { await printPage?.close() } catch {}
    printPage = null
    throw err
  }
  return pdfPath
}

// POST /api/print/escpos — fast raw thermal print (browser + Electron fallback)
// Body: { text, type?: 'kot'|'void'|'bill', host?: string, port?: number, printerName?: string }
router.post('/escpos', async (req, res) => {
  try {
    const text = String(req.body?.text || '')
    if (!text) return res.status(400).json({ ok: false, error: 'Missing text' })
    const type = String(req.body?.type || 'kot').toLowerCase()
    const { host, printerName } = await resolveKotPrintTarget(req, {
      type,
      printerName: req.body?.printerName,
      host: req.body?.host || req.body?.ip,
    })
    if (!host) {
      return res.status(400).json({
        ok: false,
        error: 'No printer IP configured. Set KOT Printer IP on the Printers page.',
        printerName: printerName || '',
      })
    }
    const result = await sendEscPosTcp(host, req.body?.port || 9100, text)
    if (!result.ok) return res.status(502).json(result)
    res.json(result)
  } catch (e) {
    console.error('ESC/POS print failed:', e)
    res.status(500).json({ ok: false, error: 'Print failed' })
  }
})

// POST /api/print
// Body: { html: string, type?: 'bill'|'kot'|'void'|'other', printerName?: string }
router.post('/', async (req, res) => {
  let pdfPath = ''
  try {
    const html = String(req.body?.html || '')
    const type = String(req.body?.type || '').toLowerCase()
    if (!html) return res.status(400).json({ ok: false, error: 'Missing html' })

    const { printerName } = await resolveKotPrintTarget(req, {
      type,
      printerName: req.body?.printerName,
    })
    if (!printerName) return res.status(400).json({ ok: false, error: 'No printer configured' })

    pdfPath = await enqueuePrint(() => htmlToTempPdf(html))
    await printPdf(pdfPath, { printer: printerName, scale: 'noscale' })
    res.json({ ok: true })
  } catch (e) {
    console.error('Server print failed:', e)
    // Drop broken browser so the next request relaunches cleanly
    try {
      if (printBrowser) {
        const b = printBrowser
        printBrowser = null
        await b.close().catch(() => {})
      }
    } catch {}
    res.status(500).json({ ok: false, error: 'Print failed' })
  } finally {
    if (pdfPath) fs.unlink(pdfPath).catch(() => {})
  }
})

// GET /api/print/printers -> list available printers on the server (for UI, optional)
router.get('/printers', async (_req, res) => {
  try {
    const list = await getPrinters().catch(() => [])
    res.json(Array.isArray(list) ? list : [])
  } catch {
    res.json([])
  }
})

export default router
