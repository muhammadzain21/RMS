import { Router } from 'express'
import fs from 'fs'
import fsp from 'fs/promises'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { pathToFileURL } from 'url'
import { randomBytes } from 'crypto'
import { authRequired } from '../middleware/auth.js'

const router = Router()
router.use(authRequired)

function findSystemBrowser() {
  const list = [
    process.env.PDF_BROWSER,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ]
  return list.find((p) => p && fs.existsSync(p)) || ''
}

function runBrowserPdf(browser, htmlPath, pdfPath) {
  const fileUrl = pathToFileURL(htmlPath).href
  const attempts = [
    ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--no-first-run', '--disable-extensions', `--print-to-pdf=${pdfPath}`, fileUrl],
    ['--headless', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, fileUrl],
  ]
  const tryOnce = (args) => new Promise((resolve, reject) => {
    execFile(browser, args, { timeout: 45000, windowsHide: true }, (err) => {
      if (err) return reject(err)
      fs.stat(pdfPath, (stErr, st) => {
        if (stErr || !st?.size) return reject(new Error('PDF was not written'))
        resolve()
      })
    })
  })
  return tryOnce(attempts[0]).catch(() => tryOnce(attempts[1]))
}

/**
 * Same A4 renderer for Print preview and PDF download.
 * Uses the system browser print-to-PDF so @page CSS matches.
 */
router.post('/pdf', async (req, res) => {
  const html = String(req.body?.html || '')
  if (!html.trim()) return res.status(400).json({ error: 'html required' })
  if (html.length > 25_000_000) return res.status(413).json({ error: 'report too large' })

  const browser = findSystemBrowser()
  if (!browser) return res.status(500).json({ error: 'Install Microsoft Edge or Google Chrome to render report PDFs' })

  const id = randomBytes(8).toString('hex')
  const dir = os.tmpdir()
  const htmlPath = path.join(dir, `rpt-${id}.html`)
  const pdfPath = path.join(dir, `rpt-${id}.pdf`)
  try {
    await fsp.writeFile(htmlPath, html, 'utf8')
    await runBrowserPdf(browser, htmlPath, pdfPath)
    const buf = await fsp.readFile(pdfPath)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Cache-Control', 'no-store')
    res.send(buf)
  } catch (e) {
    console.error('[reports/pdf]', e && e.message || e)
    res.status(500).json({ error: 'Could not render PDF' })
  } finally {
    fsp.unlink(htmlPath).catch(() => {})
    fsp.unlink(pdfPath).catch(() => {})
  }
})

export default router
