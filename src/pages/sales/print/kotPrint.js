import { groupItemsByCategory } from '../utils.js'
import { THERMAL_SLIP_CSS, PROFESSIONAL_SLIP_CSS } from './thermalCss.js'
import { openSlipPreviewDialog } from './slipPreview.js'
import { tryEscPosPrint } from './escposClient.js'
import { printThermalInPage, trySilentPrint, escapeHtml } from './shared.js'

/** Build plain ESC/POS bytes for 80mm kitchen tickets (no HTML). */
export function buildKOTEscPos(opts = {}) {
  const ESC = '\x1b'
  const GS = '\x1d'
  const state = opts.state || {}
  const menu = Array.isArray(state.menu) ? state.menu : []
  const categories = Array.isArray(state.categories) ? state.categories : []
  const items = Array.isArray(opts.items) ? opts.items : []
  const kotDate = opts.createdAt ? new Date(opts.createdAt) : new Date()
  const dateStr = kotDate.toLocaleDateString()
  const timeStr = kotDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const title = String(opts.title || 'Order Receipt')
  const tokenNo = opts.tokenNo || state.currentTokenNo || opts.token || ''
  const orderType = opts.orderType || ''
  const waiter = opts.waiter || (opts.waiterId ? (state.staff || []).find(s => s.id === opts.waiterId)?.name : '') || ''
  const tableNo = opts.tableNo || ''
  const rider = opts.rider || (opts.riderId ? (state.riders || []).find(r => r.id === opts.riderId)?.name : '') || ''
  const remarks = opts.payRemarks || opts.remarks || ''
  const userName = opts.userName || opts.user || ''
  const kitchenNote = String(opts.kitchenNote || '').trim()
  const isReprint = opts.isReprint === true
  const W = 42
  const line = (ch = '-') => ch.repeat(W)
  const row = (left, right) => {
    const L = String(left || '')
    const R = String(right || '')
    const gap = Math.max(1, W - L.length - R.length)
    return L + ' '.repeat(gap) + R
  }
  const findMenu = (id) => (menu || []).find(x => String(x.id || x._id) === String(id || ''))
  const getItemName = (it) => {
    const m = findMenu(it.itemId)
    const size = String(it?.mods?.size || it?.size || '').trim().toUpperCase()
    const flvs = Array.isArray(it?.mods?.flavours) ? it.mods.flavours : []
    if (flvs.length) {
      const names = flvs.map(fid => (findMenu(fid)?.name || '')).filter(Boolean)
      const base = names.join(' + ') || (it?.custom?.name || m?.name || it?.name || String(it.itemId || ''))
      return size ? `${base} (${size})` : base
    }
    const base = it?.custom?.name || m?.name || it?.name || String(it.itemId || '')
    return size ? `${base} (${size})` : base
  }
  let tableDisplay = ''
  if (orderType === 'Dine-in' && tableNo) {
    const floor = opts.floor || opts.tableFloor || ''
    tableDisplay = floor ? `${tableNo} / ${floor}` : String(tableNo)
  }
  const groups = groupItemsByCategory(items, menu, categories)

  let out = ''
  out += ESC + '@' // init
  out += ESC + 'a' + '\x01' // center
  out += ESC + '!' + '\x18' // double height/width-ish
  out += `${title}\n`
  out += ESC + '!' + '\x00'
  if (tokenNo) {
    out += ESC + '!' + '\x30'
    out += `Token: ${tokenNo}\n`
    out += ESC + '!' + '\x00'
  }
  out += ESC + 'a' + '\x00' // left
  out += `${line()}\n`
  out += `${dateStr} ${timeStr}\n`
  if (isReprint) out += '*** REPRINT ***\n'
  if (orderType) out += `Type: ${orderType}\n`
  if (userName) out += `User: ${userName}\n`
  if (waiter) out += `Waiter: ${waiter}\n`
  if (tableDisplay) out += `Table: ${tableDisplay}\n`
  if (rider) out += `Rider: ${rider}\n`
  if (remarks) out += `Remarks: ${remarks}\n`
  out += `${line()}\n`
  out += `${row('ITEM', 'QTY')}\n`
  out += `${line()}\n`
  for (const g of groups) {
    const showHead = g.showHeader !== false && !!String(g.categoryName || '').trim()
    if (showHead) out += `${String(g.categoryName).toUpperCase()}:\n`
    for (const { it } of g.items) {
      const name = getItemName(it)
      const qty = String(Number(it.qty || 0))
      if (name.length + qty.length + 1 <= W) {
        out += `${row(name, qty)}\n`
      } else {
        out += `${name}\n${row('', qty)}\n`
      }
    }
  }
  out += `${line()}\n`
  out += ESC + 'a' + '\x01'
  out += 'END OF ORDER\n'
  if (kitchenNote) out += `${kitchenNote}\n`
  out += ESC + 'a' + '\x00'
  out += '\n\n\n'
  out += GS + 'V' + '\x00' // full cut
  return out
}

export function buildKOTHtml(opts = {}) {
  try {
    const state = opts.state || {}
    const menu = Array.isArray(state.menu) ? state.menu : []
    const items = Array.isArray(opts.items) ? opts.items : []
    // Use provided createdAt for reprint, otherwise current time for new KOT
    const kotDate = opts.createdAt ? new Date(opts.createdAt) : new Date()
    const dateStr = kotDate.toLocaleDateString()
    const timeStr = kotDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const isReprint = opts.isReprint === true
    const title = opts.title || 'Order Receipt'
    const tokenNo = opts.tokenNo || state.currentTokenNo || opts.token || ''
    const orderType = opts.orderType || ''
    const waiter = opts.waiter || (opts.waiterId ? (state.staff||[]).find(s=>s.id===opts.waiterId)?.name : '') || ''
    const tableNo = opts.tableNo || ''
    const rider = opts.rider || (opts.riderId ? (state.riders||[]).find(r=>r.id===opts.riderId)?.name : '') || ''
    const remarks = opts.payRemarks || opts.remarks || ''
    const userName = opts.userName || opts.user || ''

    const categories = Array.isArray(state.categories) ? state.categories : []
    const findMenu = (id) => (menu || []).find(x => String(x.id || x._id) === String(id || ''))
    const getSizeCode = (it) => String(it?.mods?.size || it?.size || '').trim().toUpperCase()
    const getItemName = (it) => {
      const m = findMenu(it.itemId)
      const size = getSizeCode(it)
      const flvs = Array.isArray(it?.mods?.flavours) ? it.mods.flavours : []
      if (flvs.length) {
        const names = flvs.map(fid => (findMenu(fid)?.name || '')).filter(Boolean)
        const title = names.join(' + ') || (it?.custom?.name || m?.name || it?.name || String(it.itemId||''))
        return escapeHtml(size ? `${title} (${size})` : title)
      }
      const base = it?.custom?.name || m?.name || it?.name || String(it.itemId||'')
      return escapeHtml(size ? `${base} (${size})` : base)
    }
    const groups = groupItemsByCategory(items, menu, categories)
    const rowsHtml = groups.map((g) => {
      const showHead = g.showHeader !== false && !!String(g.categoryName || '').trim()
      const head = showHead
        ? `<tr class="cat-head"><td class="desc" colspan="2">${escapeHtml(g.categoryName)}:</td></tr>`
        : ''
      const itemRows = g.items.map(({ it }) =>
        `<tr class="${showHead ? 'cat-item' : ''}"><td class="desc">${getItemName(it)}</td><td class="qty"><b>${Number(it.qty||0)}</b></td></tr>`
      ).join('')
      return head + itemRows
    }).join('')
    const kitchenNote = String(opts.kitchenNote || '').trim()

    // Build table info for Dine-in orders
    let tableDisplay = ''
    if (orderType === 'Dine-in' && tableNo) {
      const floor = opts.floor || opts.tableFloor || ''
      tableDisplay = floor ? `Table ${tableNo} / ${floor}` : `Table ${tableNo}`
    }

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>KOT</title>
  <style>
    ${THERMAL_SLIP_CSS}
    ${PROFESSIONAL_SLIP_CSS}
    table.items .qty { width: 22%; text-align: right; }
    table.items .desc { width: 78%; }
  </style>
  </head>
  <body>
    <div class="chip">${escapeHtml(title)}</div>
    ${tokenNo ? `<div class="chip chip-token">Token No: <span class="token-num">${escapeHtml(String(tokenNo))}</span></div>` : ''}
    <div class="block">
      <table class="kvtable"><tbody>
        <tr><td>Date &amp; Time</td><td class="val">${dateStr} ${timeStr}</td></tr>
        ${isReprint ? `<tr><td>Reprint</td><td class="val">REPRINT</td></tr>` : ''}
        ${orderType ? `<tr><td>Order Type</td><td class="val">${escapeHtml(String(orderType))}</td></tr>` : ''}
        ${userName ? `<tr><td>User</td><td class="val">${escapeHtml(String(userName))}</td></tr>` : ''}
        ${waiter ? `<tr><td>Waiter</td><td class="val">${escapeHtml(String(waiter))}</td></tr>` : ''}
        ${tableDisplay ? `<tr><td>Table</td><td class="val">${escapeHtml(String(tableDisplay).replace(/^Table /, ''))}</td></tr>` : ''}
        ${rider ? `<tr><td>Rider</td><td class="val">${escapeHtml(String(rider))}</td></tr>` : ''}
        ${remarks ? `<tr><td>Remarks</td><td class="val">${escapeHtml(String(remarks))}</td></tr>` : ''}
      </tbody></table>
    </div>

    <table class="items">
      <thead>
        <tr><th class="desc">Item</th><th class="qty">Qty</th></tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="endline">END OF ORDER</div>
    ${kitchenNote ? `<div class="kitchen-note">${escapeHtml(kitchenNote)}</div>` : ''}
  </body>
</html>`
    return html
  } catch {
    return '<html><body><pre>KOT</pre></body></html>'
  }
}

/** KOT + Void share kotPrinterName / kotPrinterIp. Always open in-app preview; Print = silent. */
export async function openKotPrintUtil(opts = {}) {
  try {
    const state = opts.state || {}
    const deviceName = opts.deviceName || state?.settings?.kotPrinterName || ''
    const host = opts.host || opts.printerIp || state?.settings?.kotPrinterIp || ''
    const printType = String(opts.title || '').toLowerCase().includes('void') ? 'void' : 'kot'
    const html = buildKOTHtml({ ...opts, state })
    const escPosText = buildKOTEscPos({ ...opts, state })
    const title = opts.title?.includes('Void') ? 'Void preview' : 'KOT preview'

    // Always show preview on Sell / void — never auto-print past the dialog
    if (opts.previewInApp !== false) {
      openSlipPreviewDialog({
        html,
        escPosText,
        printType,
        deviceName,
        host,
        auto: false,
        title,
        printBtnClass: 'kot-print-btn',
        closeBtnClass: 'kot-close-btn',
      })
      return
    }

    // Explicit no-preview callers only
    if (await tryEscPosPrint(escPosText, { deviceName, host, type: printType })) return
    if (deviceName && await trySilentPrint(html, printType, deviceName)) return
    printThermalInPage(html)
  } catch {}
}

export function printKOTUtil(opts = {}) { return openKotPrintUtil(opts) }
