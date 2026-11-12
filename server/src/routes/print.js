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
  const isKot = t === 'kot' || t === 'void'
  const name = String(printerName || '').trim()
    || (isKot ? (settings?.kotPrinterName || '') : (settings?.billPrinterName || ''))
  const ip = String(host || '').trim()
    || (isKot ? (settings?.kotPrinterIp || '') : (settings?.billPrinterIp || ''))
    || (looksLikeIpv4(name) ? name : '')
  return { settings, printerName: name, host: ip }
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
        error: 'No printer IP configured. Set KOT Printer IP in Settings.',
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
  try {
    const html = String(req.body?.html || '')
    const type = String(req.body?.type || '').toLowerCase()
    if (!html) return res.status(400).json({ ok: false, error: 'Missing html' })

    const { printerName } = await resolveKotPrintTarget(req, {
      type,
      printerName: req.body?.printerName,
    })
    if (!printerName) return res.status(400).json({ ok: false, error: 'No printer configured' })

    // Render HTML to a temporary PDF via puppeteer
    const tmpDir = os.tmpdir()
    const fileBase = `print-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
    const pdfPath = path.join(tmpDir, `${fileBase}.pdf`)

    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox'] })
    try {
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'load' })
      try { await page.emulateMediaType('print') } catch {}
      await page.addStyleTag({ content: '@page { size: 80mm auto; margin: 0 } html, body { margin: 0; padding: 2mm 3mm; width: 72mm; height: auto; min-height: 0; overflow: visible }' }).catch(()=>{})
      await page.pdf({ path: pdfPath, printBackground: true, preferCSSPageSize: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } })
    } finally {
      await browser.close().catch(()=>{})
    }

    // Send PDF to printer (disable scaling so it doesn't add blank space)
    await printPdf(pdfPath, { printer: printerName, scale: 'noscale' })

    // Best-effort cleanup
    fs.unlink(pdfPath).catch(()=>{})

    res.json({ ok: true })
  } catch (e) {
    console.error('Server print failed:', e)
    res.status(500).json({ ok: false, error: 'Print failed' })
  }
})

// GET /api/print/printers -> list available printers on the server (for UI, optional)
router.get('/printers', async (_req, res) => {
  try {
    const list = await getPrinters().catch(()=>[])
    res.json(Array.isArray(list) ? list : [])
  } catch {
    res.json([])
  }
})

export default router
