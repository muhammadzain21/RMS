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
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    // Linux (typical VPS / Docker)
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ]
  return list.find((p) => p && fs.existsSync(p)) || ''
}

function runBrowserPdf(browser, htmlPath, pdfPath) {
  const fileUrl = pathToFileURL(htmlPath).href
  const attempts = [
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox', '--no-pdf-header-footer', '--no-first-run', '--disable-extensions', `--print-to-pdf=${pdfPath}`, fileUrl],
    ['--headless', '--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox', '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, fileUrl],
  ]
  const tryOnce = (args) => new Promise((resolve, reject) => {
    execFile(browser, args, { timeout: 60000, windowsHide: true }, (err) => {
      if (err) return reject(err)
      fs.stat(pdfPath, (stErr, st) => {
        if (stErr || !st?.size) return reject(new Error('PDF was not written'))
        resolve()
      })
    })
  })
  return tryOnce(attempts[0]).catch(() => tryOnce(attempts[1]))
}

async function renderWithPuppeteer(html, pdfPath) {
  const puppeteer = (await import('puppeteer')).default
  const executablePath = findSystemBrowser() || undefined
  const browser = await puppeteer.launch({
    headless: 'new',
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 45000 })
    try { await page.emulateMediaType('print') } catch {}
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
    })
  } finally {
    await browser.close().catch(() => {})
  }
  const st = await fsp.stat(pdfPath).catch(() => null)
  if (!st?.size) throw new Error('Puppeteer PDF was not written')
}

/**
 * A4 report PDF for Download (and any client that still posts HTML here).
 * Linux VPS: Chromium/Chrome via env or Puppeteer bundled browser.
 */
router.post('/pdf', async (req, res) => {
  const html = String(req.body?.html || '')
  if (!html.trim()) return res.status(400).json({ error: 'html required' })
  if (html.length > 25_000_000) return res.status(413).json({ error: 'report too large' })

  const id = randomBytes(8).toString('hex')
  const dir = os.tmpdir()
  const htmlPath = path.join(dir, `rpt-${id}.html`)
  const pdfPath = path.join(dir, `rpt-${id}.pdf`)

  try {
    await fsp.writeFile(htmlPath, html, 'utf8')

    let rendered = false
    const systemBrowser = findSystemBrowser()
    if (systemBrowser) {
      try {
        await runBrowserPdf(systemBrowser, htmlPath, pdfPath)
        rendered = true
      } catch (e) {
        console.warn('[reports/pdf] system browser failed, trying puppeteer:', e?.message || e)
      }
    }

    if (!rendered) {
      try {
        await renderWithPuppeteer(html, pdfPath)
        rendered = true
      } catch (e) {
        console.error('[reports/pdf] puppeteer failed:', e?.message || e)
        return res.status(500).json({
          error: 'Could not render PDF',
          detail: String(e?.message || e),
          hint: 'Install Chromium on the server or set PDF_BROWSER / PUPPETEER_EXECUTABLE_PATH',
        })
      }
    }

    const buf = await fsp.readFile(pdfPath)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Cache-Control', 'no-store')
    res.send(buf)
  } catch (e) {
    console.error('[reports/pdf]', e && e.message || e)
    res.status(500).json({ error: 'Could not render PDF', detail: String(e?.message || e) })
  } finally {
    fsp.unlink(htmlPath).catch(() => {})
    fsp.unlink(pdfPath).catch(() => {})
  }
})

export default router
