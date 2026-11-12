import { groupItemsByCategory, getCategoryPackagePrice } from '../utils.js'
import { THERMAL_SLIP_CSS, PROFESSIONAL_SLIP_CSS } from './thermalCss.js'
import { openSlipPreviewDialog } from './slipPreview.js'
import { printThermalInPage, trySilentPrint, fmt, escapeHtml } from './shared.js'

/** Only the official bank/Raast QR image works with payment apps — plain IBAN QR is invalid. */
function resolveBankQrDataUrl(settings = {}) {
  if (!settings?.printBankQrOnBill) return ''
  return String(settings.bankQrImage || '').trim()
}

// Core: Sale receipt printer (used on payment and reprint)
export async function printSaleReceiptUtil(opts = {}) {
  try {
    const state = opts.state || {}
    const menu = Array.isArray(state.menu) ? state.menu : []
    const items = Array.isArray(opts.items) ? opts.items : []
    const company = state?.settings?.companyName || 'Restaurant POS'
    // Logo source preference: prefer settings-provided logo first, then any explicit override.
    // This avoids trying a non-existent public file first (which would 404 in packaged Electron).
    const logoCandidates = [
      state?.settings?.receiptLogo,
      state?.settings?.logo,
      state?.settings?.logoUrl,
      opts.logoUrl,
    ]
    .filter(Boolean)
    // Drop known missing fallback used in some flows
    .filter(u => !/receipt-logo\.png\.jpg$/i.test(String(u||'')))
    const logoUrl = logoCandidates[0] || ''
    const phone = state?.settings?.phone || ''
    const titleText = (opts.title || 'Sale Receipt')
    const address = state?.settings?.address || ''
    // Use provided createdAt for reprint, otherwise current time for new sale
    const saleDate = opts.createdAt ? new Date(opts.createdAt) : new Date()
    const dateStr = saleDate.toLocaleDateString()
    const timeStr = saleDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    // Track if this is a reprint (has original timestamp)
    const isReprint = !!opts.createdAt

    const categories = Array.isArray(state.categories) ? state.categories : []
    const getMenuItem = (id) => menu.find(m => m.id === id)
    const getRate = (m, it) => {
      if (typeof it?.price === 'number') return Number(it.price || 0)
      if (!m && it?.custom) return Number(it.custom.price || 0)
      if (!m) return 0
      return Number(m.price || 0)
    }
    const getSizeCode = (it) => String(it?.mods?.size || it?.size || '').trim().toUpperCase()
    const getName = (m, it) => it?.custom?.name || m?.name || it?.name || it?.itemName || 'Item'
    const buildDisplayName = (it) => {
      const m = getMenuItem(it.itemId)
      const size = getSizeCode(it)
      const ids = Array.isArray(it?.mods?.flavours) ? it.mods.flavours : []
      if (ids.length) {
        const names = ids.map(id => (getMenuItem(id)?.name || '')).filter(Boolean)
        const title = names.join(' + ') || getName(m, it)
        return size ? `${title} (${size})` : title
      }
      const base = getName(m, it)
      return size ? `${base} (${size})` : base
    }
    const qty = (it) => Number(it?.qty || 0)

    // Totals — category package price (when set) ignores item prices
    const groups = groupItemsByCategory(items, menu, categories)
    let subtotal = 0
    for (const g of groups) {
      const pkg = Number(g.packagePrice || 0) || getCategoryPackagePrice(g.category, g.items[0]?.it)
      if (pkg > 0) {
        subtotal += pkg
      } else {
        for (const { it, menuItem } of g.items) {
          subtotal += getRate(menuItem, it) * qty(it)
        }
      }
    }
    const itemsDiscount = Number(opts.itemsDiscount || 0)
    const billDiscount = Number(opts.billDiscount || 0)
    const taxAmt = Number(opts.taxAmt || 0)
    const serviceAmt = Number(opts.serviceAmt || 0)
    const deliveryAmt = Number(opts.deliveryAmt || 0)
    const total = Math.max(0, subtotal - itemsDiscount - billDiscount + taxAmt + serviceAmt + deliveryAmt)
    const cashPaid = Number(opts.cashReceived ?? total)
    const tipAmt = Math.max(0, Number(opts.tipAmount || 0))
    const balance = tipAmt > 0 ? 0 : Math.max(0, cashPaid - total)

    const orderType = opts.orderType || 'Take-away'
    const BANK_CHANNELS = { bank_account: 'Bank Account', jazzcash: 'JazzCash', easypaisa: 'EasyPaisa', sadapay: 'SadaPay', nayapay: 'NayaPay', raast: 'Raast', upaisa: 'UPaisa', zindigi: 'Zindigi' }
    const pmRaw = (opts.paymentMethod || 'Cash').toString()
    const pmLower = pmRaw.toLowerCase()
    const paymentType = pmLower === 'bank'
      ? `Bank (${BANK_CHANNELS[opts.bankChannel] || opts.bankChannel || 'Transfer'}${opts.bankLast4 ? ` ····${opts.bankLast4}` : ''})`
      : pmLower === 'card'
        ? `Card${opts.bankLast4 ? ` ····${opts.bankLast4}` : ''}`
      : pmLower === 'staff'
        ? `Staff (${opts.staffName || 'Member'})`
        : pmRaw.charAt(0).toUpperCase() + pmRaw.slice(1)
    const waiter = opts.waiter || (opts.waiterId ? (state.staff||[]).find(s=>s.id===opts.waiterId)?.name : '') || '-'
    const rider = opts.rider || (opts.riderId ? (state.riders||[]).find(r=>r.id===opts.riderId)?.name : '') || ''
    const tableNo = opts.tableNo || ''
    const floor = opts.floor || opts.tableFloor || ''
    const tokenNo = opts.tokenNo || opts.token || ''
    const billNo = opts.billNoOverride || opts.billNo || ''
    const orderNo = opts.receiptOrderNo || opts.orderNo || ''
    const customer = opts.customer || { name: '', address: '', phone: '' }

    const rowsHtml = groups.map((g) => {
      const pkg = Number(g.packagePrice || 0) || getCategoryPackagePrice(g.category, g.items[0]?.it)
      const showHead = g.showHeader !== false && !!String(g.categoryName || '').trim()
      const head = showHead
        ? `<tr class="cat-head"><td class="desc" colspan="4">${escapeHtml(g.categoryName)}:</td></tr>`
        : ''
      const itemRows = g.items.map(({ it, menuItem }) => {
        const name = buildDisplayName(it)
        if (pkg > 0) {
          return `<tr class="${showHead ? 'cat-item' : ''}">
            <td class="desc">${escapeHtml(name)}</td>
            <td class="qty">${qty(it)}</td>
            <td class="rate"></td>
            <td class="amount"></td>
          </tr>`
        }
        const rate = getRate(menuItem, it)
        const amount = rate * qty(it)
        return `<tr class="${showHead ? 'cat-item' : ''}">
          <td class="desc">${escapeHtml(name)}</td>
          <td class="qty">${qty(it)}</td>
          <td class="rate">${fmt(rate)}</td>
          <td class="amount">${fmt(amount)}</td>
        </tr>`
      }).join('')
      const priceRow = pkg > 0 && showHead
        ? `<tr class="cat-price">
            <td class="desc">${escapeHtml(g.categoryName)} price</td>
            <td class="qty">1</td>
            <td class="rate">${fmt(pkg)}</td>
            <td class="amount">${fmt(pkg)}</td>
          </tr>`
        : ''
      return head + itemRows + priceRow
    }).join('')

    // Prefer silent printing when a Bill/Customer Bill printer is configured
    const deviceName = opts.deviceName || state?.settings?.billPrinterName || ''
    const auto = opts.autoPrint !== false
    const toAbsolute = (u)=>{
      try {
        if (!u) return ''
        if (/^(data:|https?:|file:)/i.test(u)) return u
        const isFileProto = String(window.location.protocol).startsWith('file')
        // Under file://, leading slash points to filesystem root and will fail; make it relative
        if (u.startsWith('/')) {
          if (isFileProto) {
            return new URL('.' + u, window.location.href).href
          }
          return window.location.origin + u
        }
        return new URL(u, window.location.href).href
      } catch { return u }
    }
    const logoAbs = toAbsolute(logoUrl)
    const logoAbsList = logoCandidates.map(toAbsolute)
    const bankQrSrc = resolveBankQrDataUrl(state?.settings || {})
    const bankQrLabel = String(state?.settings?.bankQrLabel || 'Scan to pay').trim() || 'Scan to pay'
    const bankQrHint = String(state?.settings?.bankQrPayload || '').trim()
    const showBankPay = Boolean(state?.settings?.printBankQrOnBill) && (bankQrSrc || bankQrHint)
    const bankQrHtml = showBankPay
      ? `<div class="pay-qr">
    <div class="pay-qr-label">${escapeHtml(bankQrLabel)}</div>
    ${bankQrSrc ? `<img alt="Pay QR" src="${escapeHtml(bankQrSrc)}" />` : ''}
    ${bankQrHint ? `<div class="pay-qr-hint">${escapeHtml(bankQrHint)}</div>` : ''}
  </div>`
      : ''
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Sale Receipt</title>
  <base href="${escapeHtml(window.location.href)}" />
  <style>
    ${THERMAL_SLIP_CSS}
    ${PROFESSIONAL_SLIP_CSS}
  </style>
</head>
<body>
  <div class="brand">
    <img id="receiptLogo" alt="logo" src="${escapeHtml(logoAbs)}" onerror="this.style.display='none'" />
    ${company ? `<div class="brand-name">${escapeHtml(company)}</div>` : ''}
    ${phone ? `<div class="brand-meta">Contact : ${escapeHtml(phone)}</div>` : ''}
    ${address ? `<div class="brand-meta">${escapeHtml(address)}</div>` : ''}
  </div>

  <div class="chip">${escapeHtml(titleText)}</div>
  ${tokenNo ? `<div class="chip chip-token">Token No: <span class="token-num">${escapeHtml(String(tokenNo))}</span></div>` : ''}

  <div class="block">
    <table class="kvtable"><tbody>
      ${billNo ? `<tr><td>Bill No</td><td class="val">${escapeHtml(String(billNo))}</td></tr>` : ''}
      <tr><td>Date &amp; Time</td><td class="val">${dateStr} ${timeStr}</td></tr>
      ${isReprint ? `<tr><td>Reprint</td><td class="val">REPRINT</td></tr>` : ''}
      <tr><td>Payment Type</td><td class="val">${escapeHtml(paymentType)}</td></tr>
      ${opts.deliveryDate ? `<tr><td>Delivery Date</td><td class="val">${escapeHtml(String(opts.deliveryDate))}</td></tr>` : ''}
      ${customer?.name ? `<tr><td>Name</td><td class="val">${escapeHtml(customer.name)}</td></tr>` : ''}
      ${customer?.address ? `<tr><td>Address</td><td class="val">${escapeHtml(customer.address)}</td></tr>` : ''}
      ${customer?.phone ? `<tr><td>Phone</td><td class="val">${escapeHtml(customer.phone)}</td></tr>` : ''}
      ${opts.userName ? `<tr><td>User</td><td class="val">${escapeHtml(String(opts.userName))}</td></tr>` : ''}
      ${orderType ? `<tr><td>Channel</td><td class="val">${escapeHtml(orderType)}</td></tr>` : ''}
      ${tableNo ? `<tr><td>Table</td><td class="val">${escapeHtml(String(tableNo))}${floor ? ` / ${escapeHtml(floor)}` : ''}</td></tr>` : ''}
      ${rider ? `<tr><td>Rider</td><td class="val">${escapeHtml(rider)}</td></tr>` : ''}
    </tbody></table>
  </div>

  <table class="items">
    <colgroup>
      <col style="width:46%" />
      <col style="width:14%" />
      <col style="width:20%" />
      <col style="width:20%" />
    </colgroup>
    <thead>
      <tr><th class="desc">Item</th><th class="qty">Qty</th><th class="rate">Rate</th><th class="amount">Amt</th></tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="hr"></div>
  <div class="totals">
    <div class="kv"><span>Total amount</span><span>${fmt(subtotal)}</span></div>
    <div class="kv"><span>Discount</span><span>${fmt(itemsDiscount + billDiscount)}</span></div>
    ${serviceAmt ? `<div class="kv"><span>Service charges</span><span>${fmt(serviceAmt)}</span></div>` : ''}
    ${deliveryAmt ? `<div class="kv"><span>Delivery charges</span><span>${fmt(deliveryAmt)}</span></div>` : ''}
    ${taxAmt ? `<div class="kv"><span>Tax</span><span>${fmt(taxAmt)}</span></div>` : ''}
    <div class="kv total"><span>Net total</span><span>${fmt(total)}</span></div>
    <div class="kv"><span>Cash paid</span><span>${fmt(cashPaid)}</span></div>
    ${tipAmt > 0
      ? `<div class="kv"><span>Waiter tip</span><span>${fmt(tipAmt)}</span></div>`
      : `<div class="kv"><span>Cash balance</span><span>${fmt(balance)}</span></div>`}
  </div>

  ${bankQrHtml}
  ${state?.settings?.billingFooter ? `<div class="footer">${escapeHtml(state.settings.billingFooter)}</div>` : ''}

  <script>
    (function(){
      try{
        var list = ${JSON.stringify(logoAbsList)}.filter(Boolean)
        var imgEl = document.getElementById('receiptLogo')
        if(!imgEl || !list.length){ if(imgEl) imgEl.style.display='none'; return }
        var i = 0
        var tryNext = function(){
          if(i>=list.length){ imgEl.style.display='none'; return }
          var src = list[i++]
          var probe = new Image()
          probe.onload = function(){ imgEl.src = src; imgEl.style.display='block' }
          probe.onerror = tryNext
          probe.src = src
        }
        tryNext()
      }catch(e){}
    })();
  </script>
</body>
</html>`

    // If auto print mode and printer configured, try silent/server print first (no dialog)
    if (auto && deviceName) {
      if (await trySilentPrint(html, 'bill', deviceName)) return
    }

    if (opts.previewInApp !== false) {
      openSlipPreviewDialog({
        html,
        printType: 'bill',
        deviceName,
        auto,
        title: 'Sale receipt',
        printBtnClass: 'receipt-print-btn',
        closeBtnClass: 'receipt-close-btn',
      })
      return
    }

    printThermalInPage(html)
  } catch {}
}

export function printReceiptUtil(_opts = {}) {}
export function printCustomerBillUtil(opts = {}) { return printSaleReceiptUtil(opts) }
export function printUnpaidCustomerBillUtil(_opts = {}) {}
export function printRiderSlipUtil(_opts = {}) {}
