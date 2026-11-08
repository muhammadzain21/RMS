import { Router } from 'express'
import os from 'os'
import path from 'path'
import { promises as fs } from 'fs'
import puppeteer from 'puppeteer'
import ptp from 'pdf-to-printer'
import Settings from '../models/Settings.js'
import { authRequired } from '../middleware/auth.js'

const { print: printPdf, getPrinters } = ptp || {}
const router = Router()

router.use(authRequired)

// POST /api/print
// Body: { html: string, type?: 'bill'|'kot'|'void'|'other', printerName?: string }
router.post('/', async (req, res) => {
  try {
    const html = String(req.body?.html || '')
    const type = String(req.body?.type || '').toLowerCase()
    const overrideName = String(req.body?.printerName || '').trim()
    if (!html) return res.status(400).json({ ok: false, error: 'Missing html' })

    // Determine target printer from settings if not overridden
    const settings = await Settings.findOne({}).lean()
    let printerName = overrideName
    if (!printerName) {
      if (type === 'kot' || type === 'void') printerName = settings?.kotPrinterName || ''
      else printerName = settings?.billPrinterName || ''
    }
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
