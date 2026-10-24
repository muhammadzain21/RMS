// Printing utilities
const isDarkMode = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
const getAPIBase = () => {
  try {
    if (typeof window !== 'undefined' && window.API_BASE) return window.API_BASE
  } catch {}
  try {
    // Vite provides import.meta.env
    if (import.meta && import.meta.env && import.meta.env.VITE_API_BASE) {
      return import.meta.env.VITE_API_BASE
    }
  } catch {}
  return 'http://localhost:5000'
}
async function tryServerPrint(html, type = 'bill', printerName = '') {
  try {
    const api = getAPIBase()
    const token = (
      (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('auth_token')) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('auth_token')) ||
      ''
    )
    // Skip server print if no printer configured (avoids 400 error)
    if (!printerName) {
      console.log(`[tryServerPrint] Skipped: no printer configured for ${type}`)
      return false
    }
    console.log(`[tryServerPrint] Sending ${type} print to server...`)
    const res = await fetch(`${api}/api/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ html, type, printerName })
    })
    const result = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error(`[tryServerPrint] Server error ${res.status}:`, result.error || result)
    } else {
      console.log(`[tryServerPrint] Success:`, result)
    }
    return res.ok
  } catch (e) {
    console.error('[tryServerPrint] Failed:', e)
    return false
  }
}

// Silent print chain: Electron native silent print first (same Chromium engine as
// manual printing, so thermal drivers render identically), then server-side
// pdf-to-printer (SumatraPDF) as fallback for browser/dev mode.
// Returns true when the job was accepted by the printer.
async function trySilentPrint(html, type, deviceName) {
  try {
    if (window && window.printing && window.printing.printHTML) {
      const out = await window.printing.printHTML(html, deviceName)
      if (out && out.ok) return true
      if (out && out.error) console.warn('[trySilentPrint] Electron print failed:', out.error)
    }
  } catch (e) {
    console.warn('[trySilentPrint] Electron print error:', e)
  }
  if (await tryServerPrint(html, type, deviceName)) return true
  return false
}

export async function openKotPrintUtil(opts = {}) {
  try {
    const state = opts.state || {}
    const html = buildKOTHtml({ ...opts, state })
    const auto = opts.autoPrint !== false
    // Prefer Electron silent printing when a KOT/Void printer is configured
    const deviceName = opts.deviceName || state?.settings?.kotPrinterName || ''
    
    // If auto print mode and printer configured, try silent/server print first (no dialog)
    if (auto && deviceName) {
      if (await trySilentPrint(html, 'kot', deviceName)) return
    }
    
    // Show preview dialog for manual printing or when silent printing not available
    const useInApp = opts.previewInApp !== false
    if (useInApp) {
      const overlay = document.createElement('div')
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:12px;'
      const dark = isDarkMode()
      const frameWrap = document.createElement('div')
      frameWrap.style.cssText = `background:${dark?'#111827':'#fff'};width:420px;max-width:95vw;height:640px;max-height:95vh;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,0.3);display:flex;flex-direction:column;overflow:hidden;`
      const toolbar = document.createElement('div')
      toolbar.style.cssText = `display:flex;gap:8px;justify-content:flex-end;padding:8px;border-bottom:1px solid ${dark?'#374151':'#e5e7eb'};background:${dark?'#1f2937':'#fafafa'}`
      const btnPrint = document.createElement('button')
      btnPrint.textContent = 'Print'
      btnPrint.className = 'kot-print-btn'
      btnPrint.style.cssText = 'padding:8px 16px;border:0;background:linear-gradient(135deg,#10b981,#059669);color:#fff;cursor:pointer;border-radius:6px;font-weight:600;box-shadow:0 2px 4px rgba(0,0,0,0.1)'
      const btnClose = document.createElement('button')
      btnClose.textContent = 'OK'
      btnClose.className = 'kot-close-btn'
      btnClose.style.cssText = `padding:8px 16px;border:1px solid ${dark?'#4b5563':'#d1d5db'};background:${dark?'#374151':'#f9fafb'};color:${dark?'#e5e7eb':'#374151'};cursor:pointer;border-radius:6px;font-weight:500`
      const iframe = document.createElement('iframe')
      iframe.style.cssText = 'border:0;flex:1;width:100%'
      toolbar.appendChild(btnPrint); toolbar.appendChild(btnClose)
      frameWrap.appendChild(toolbar); frameWrap.appendChild(iframe)
      overlay.appendChild(frameWrap)
      document.body.appendChild(overlay)
      // Allow closing via ESC and backdrop click
      overlay.tabIndex = -1
      overlay.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') cleanup() })
      overlay.addEventListener('click', (e)=>{ if (e.target === overlay) cleanup() })
      try { overlay.focus() } catch {}
      const doc = iframe.contentDocument || iframe.contentWindow?.document
      if (doc) { doc.open(); doc.write(html); doc.close() }
      const doPrint = () => { try { iframe.contentWindow?.focus(); iframe.contentWindow?.print() } catch {} }
      const cleanup = () => { try { document.body.removeChild(overlay) } catch {} }
      // Silent-print to the configured KOT printer; if every silent path fails,
      // fall back to the system print dialog so the job is never silently lost
      btnPrint.onclick = () => {
        if (deviceName) {
          trySilentPrint(html, 'kot', deviceName)
            .then(ok => { if (!ok) doPrint() })
            .catch(() => doPrint())
            .finally(cleanup)
          return
        }
        doPrint()
        cleanup()
      }
      btnClose.onclick = cleanup
      if (auto) setTimeout(() => btnPrint.click(), 50)
      return
    }
    
    // Fallback: open in popup window if preview disabled
    const w = window.open('', 'kotPrint', 'width=380,height=640')
    if (!w) return
    w.document.open(); w.document.write(html); w.document.close()
  } catch {}
}
export function printReceiptUtil(_opts = {}) {}
export function printKOTUtil(opts = {}) { return openKotPrintUtil(opts) }
export function printCustomerBillUtil(opts = {}) { return printSaleReceiptUtil(opts) }
export function printUnpaidCustomerBillUtil(_opts = {}) {}
export function printRiderSlipUtil(_opts = {}) {}

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
    const getFlavourNote = (it) => {
      try {
        const ids = Array.isArray(it?.mods?.flavours) ? it.mods.flavours : []
        if (!ids.length) return ''
        const names = ids
          .map(id => (getMenuItem(id)?.name || ''))
          .filter(Boolean)
          .map(n => escapeHtml(n))
        return names.length ? `<div class="muted">Flavour: ${names.join(', ')}</div>` : ''
      } catch { return '' }
    }

    // Totals
    const lineAmount = (m, it) => getRate(m, it) * qty(it)
    const subtotal = items.reduce((s, it) => s + lineAmount(getMenuItem(it.itemId), it), 0)
    const itemsDiscount = Number(opts.itemsDiscount || 0)
    const billDiscount = Number(opts.billDiscount || 0)
    const taxAmt = Number(opts.taxAmt || 0)
    const serviceAmt = Number(opts.serviceAmt || 0)
    const total = Math.max(0, subtotal - itemsDiscount - billDiscount + taxAmt + serviceAmt)
    const cashPaid = Number(opts.cashReceived ?? total)
    const balance = Math.max(0, cashPaid - total)

    const orderType = opts.orderType || 'Take-away'
    const paymentType = (opts.paymentMethod || 'Cash').toString()
    const waiter = opts.waiter || (opts.waiterId ? (state.staff||[]).find(s=>s.id===opts.waiterId)?.name : '') || '-'
    const rider = opts.rider || (opts.riderId ? (state.riders||[]).find(r=>r.id===opts.riderId)?.name : '') || ''
    const tableNo = opts.tableNo || ''
    const floor = opts.floor || opts.tableFloor || ''
    const tokenNo = opts.tokenNo || opts.token || ''
    const billNo = opts.billNoOverride || opts.billNo || ''
    const orderNo = opts.receiptOrderNo || opts.orderNo || ''
    const customer = opts.customer || { name: '', address: '', phone: '' }

    const rowsHtml = items.map((it) => {
      const m = getMenuItem(it.itemId)
      const name = buildDisplayName(it)
      const rate = getRate(m, it)
      const amount = lineAmount(m, it)
      return `<tr>
        <td class="desc">${escapeHtml(name)}</td>
        <td class="qty">${qty(it)}</td>
        <td class="rate">${fmt(rate)}</td>
        <td class="amount">${fmt(amount)}</td>
      </tr>`
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
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Sale Receipt</title>
  <base href="${escapeHtml(window.location.href)}" />
  <style>
    body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#000;margin:0;padding:8px}
    h1{font-size:14px;margin:0 0 4px;text-align:center}
    .center{ text-align:center }
    .muted{ color:#444; font-size:10px }
    .block{ margin:4px 0 }
    table{width:100%;border-collapse:collapse;margin-top:6px;table-layout:fixed}
    th,td{padding:2px 0;border-bottom:1px solid #ddd}
    th{font-weight:bold;background:#f7f7f7}
    .desc{ width:50%; word-break:break-word; text-align:left }
    th.desc{ text-align:left }
    .qty{ text-align:right; width:10% }
    .rate{ text-align:right; width:20% }
    .amount{ text-align:right; width:20% }
    .kv{ display:flex; justify-content:space-between; margin:1px 0 }
    .emph{ font-weight:700; color:#000 }
    .total{ font-weight:bold; font-size:12px; }
    .hr{ border-top:1px dashed #999; margin:4px 0 }
    .toolbar{ position:sticky; top:0; background:#fff; padding:6px 0; display:${auto ? 'none' : 'flex'}; gap:8px; justify-content:flex-end; border-bottom:1px solid #ddd }
    .btn{ padding:6px 10px; border:1px solid #999; background:#f5f5f5; cursor:pointer }
  </style>
</head>
<body>
  <div class="center">
    <img id="receiptLogo" alt="logo" src="${escapeHtml(logoAbs)}" onerror="this.style.display='none'" style="max-height:60px;max-width:100%;object-fit:contain;display:block;margin:0 auto 4px" />
    ${company ? `<h1>${escapeHtml(company)}</h1>` : ''}
    ${phone ? `<div class="muted emph">Contact : <b>${escapeHtml(phone)}</b></div>` : ''}
    ${address ? `<div class="muted emph"><b>${escapeHtml(address)}</b></div>` : ''}
  </div>

  <div class="block center" style="border:1px solid #ccc; padding:4px; margin-top:6px">${escapeHtml(titleText)}</div>
  ${tokenNo ? `<div class="center" style="border:1px solid #ccc; padding:4px; margin-top:4px">Token No: <b>${escapeHtml(String(tokenNo))}</b></div>` : ''}

  <div class="block">
    <table class="kvtable"><tbody>
      ${billNo ? `<tr><td>Bill No :</td><td class="val">${escapeHtml(String(billNo))}</td></tr>` : ''}
      <tr><td>Date & Time :</td><td class="val">${dateStr} ${timeStr}</td></tr>
      ${isReprint ? `<tr><td>Reprint :</td><td class="val"><b>REPRINT</b></td></tr>` : ''}
      <tr><td>Payment Type :</td><td class="val">${escapeHtml(paymentType)}</td></tr>
      ${opts.deliveryDate ? `<tr><td>Delivery Date :</td><td class="val">${escapeHtml(String(opts.deliveryDate))}</td></tr>` : ''}
      ${customer?.name ? `<tr><td>Name :</td><td class="val">${escapeHtml(customer.name)}</td></tr>` : ''}
      ${customer?.address ? `<tr><td>Address :</td><td class="val">${escapeHtml(customer.address)}</td></tr>` : ''}
      ${customer?.phone ? `<tr><td>Phone :</td><td class="val">${escapeHtml(customer.phone)}</td></tr>` : ''}
      ${opts.userName ? `<tr><td>User :</td><td class="val">${escapeHtml(String(opts.userName))}</td></tr>` : ''}
      ${orderType ? `<tr><td>Channel :</td><td class="val">${escapeHtml(orderType)}</td></tr>` : ''}
      ${tableNo ? `<tr><td>Table :</td><td class="val">${escapeHtml(String(tableNo))}${floor ? ` / ${escapeHtml(floor)}` : ''}</td></tr>` : ''}
      ${rider ? `<tr><td>Rider :</td><td class="val">${escapeHtml(rider)}</td></tr>` : ''}
    </tbody></table>
  </div>

  <table>
    <colgroup>
      <col style="width:50%" />
      <col style="width:10%" />
      <col style="width:20%" />
      <col style="width:20%" />
    </colgroup>
    <thead>
      <tr><th class="desc">Des</th><th class="qty">Qty</th><th class="rate">Rate</th><th class="amount">Amt</th></tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="block">
    <div class="kv"><span>No Of Items:</span><span>${items.length}</span></div>
    <div class="kv"><span>Total Qty:</span><span>${items.reduce((s,it)=>s+qty(it),0)}</span></div>
  </div>

  <div class="hr"></div>
  <div class="kv"><span>Total Amount :</span><span>${fmt(subtotal)}</span></div>
  <div class="kv"><span>Discount :</span><span>${fmt(itemsDiscount + billDiscount)}</span></div>
  ${serviceAmt ? `<div class=\"kv\"><span>Service Charges :</span><span>${fmt(serviceAmt)}</span></div>` : ''}
  ${taxAmt ? `<div class=\"kv\"><span>Tax :</span><span>${fmt(taxAmt)}</span></div>` : ''}
  <div class="kv total"><span>Net Total :</span><span>${fmt(total)}</span></div>
  <div class="kv"><span>Cash Paid :</span><span>${fmt(cashPaid)}</span></div>
  <div class="kv"><span>Cash Balance :</span><span>${fmt(balance)}</span></div>

  ${state?.settings?.billingFooter ? `<div class="center muted emph" style="margin-top:4px; white-space:pre-wrap"><b>${escapeHtml(state.settings.billingFooter)}</b></div>` : ''}

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
  ${auto ? '<script>window.onload=()=>{window.print();}</script>' : ''}
</body>
</html>`

    // If auto print mode and printer configured, try silent/server print first (no dialog)
    if (auto && deviceName) {
      if (await trySilentPrint(html, 'bill', deviceName)) return
    }

    // Show preview dialog for manual printing or when silent printing not available
    const useInApp = opts.previewInApp !== false
    if (useInApp) {
      const overlay = document.createElement('div')
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:12px;'
      const dark = isDarkMode()
      const frameWrap = document.createElement('div')
      frameWrap.style.cssText = `background:${dark?'#111827':'#fff'};width:420px;max-width:95vw;height:640px;max-height:95vh;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,0.3);display:flex;flex-direction:column;overflow:hidden;`
      const toolbar = document.createElement('div')
      toolbar.style.cssText = `display:flex;gap:8px;justify-content:flex-end;padding:8px;border-bottom:1px solid ${dark?'#374151':'#e5e7eb'};background:${dark?'#1f2937':'#fafafa'}`
      const btnPrint = document.createElement('button')
      btnPrint.textContent = 'Print'
      btnPrint.className = 'receipt-print-btn'
      btnPrint.style.cssText = 'padding:8px 16px;border:0;background:linear-gradient(135deg,#10b981,#059669);color:#fff;cursor:pointer;border-radius:6px;font-weight:600;box-shadow:0 2px 4px rgba(0,0,0,0.1)'
      const btnClose = document.createElement('button')
      btnClose.textContent = 'OK'
      btnClose.className = 'receipt-close-btn'
      btnClose.style.cssText = `padding:8px 16px;border:1px solid ${dark?'#4b5563':'#d1d5db'};background:${dark?'#374151':'#f9fafb'};color:${dark?'#e5e7eb':'#374151'};cursor:pointer;border-radius:6px;font-weight:500`
      const iframe = document.createElement('iframe')
      iframe.style.cssText = 'border:0;flex:1;width:100%'
      toolbar.appendChild(btnPrint); toolbar.appendChild(btnClose)
      frameWrap.appendChild(toolbar); frameWrap.appendChild(iframe)
      overlay.appendChild(frameWrap)
      document.body.appendChild(overlay)

      // Write content
      const doc = iframe.contentDocument || iframe.contentWindow?.document
      if (doc) { doc.open(); doc.write(html); doc.close() }

      const doPrint = () => {
        try { iframe.contentWindow?.focus(); iframe.contentWindow?.print() } catch {}
      }
      const cleanup = () => { try { document.body.removeChild(overlay) } catch {} }
      // Silent-print to the configured Bill printer; if every silent path fails,
      // fall back to the system print dialog so the job is never silently lost
      btnPrint.onclick = () => {
        if (deviceName) {
          trySilentPrint(html, 'bill', deviceName)
            .then(ok => { if (!ok) doPrint() })
            .catch(() => doPrint())
            .finally(cleanup)
          return
        }
        doPrint()
        cleanup()
      }
      btnClose.onclick = cleanup
      if (auto) {
        // Auto print then keep preview visible (no auto-close per your preview request)
        setTimeout(() => btnPrint.click(), 50)
      }
      return
    }

    // Fallback: open in popup window
    const w = window.open('', 'salePrint', 'width=380,height=640')
    if (!w) return
    w.document.open()
    w.document.write(html)
    w.document.close()
  } catch {}
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

    const getSizeCode = (it) => String(it?.mods?.size || it?.size || '').trim().toUpperCase()
    const getItemName = (it) => {
      const m = menu.find(x=>x.id===it.itemId)
      const size = getSizeCode(it)
      const flvs = Array.isArray(it?.mods?.flavours) ? it.mods.flavours : []
      if (flvs.length) {
        const names = flvs.map(fid => (menu.find(x=>x.id===fid)?.name || '')).filter(Boolean)
        const title = names.join(' + ') || (it?.custom?.name || m?.name || it?.name || String(it.itemId||''))
        return escapeHtml(size ? `${title} (${size})` : title)
      }
      const base = it?.custom?.name || m?.name || it?.name || String(it.itemId||'')
      return escapeHtml(size ? `${base} (${size})` : base)
    }
    const rowsHtml = items.map(it => `<tr><td>${getItemName(it)}</td><td class="qty"><b>${Number(it.qty||0)}</b></td></tr>`).join('')
    const kitchenNote = opts.kitchenNote || 'Please prepare immediately'

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
    body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#000;margin:0;padding:16px}
    h1{font-size:16px;margin:0 0 6px;text-align:center}
    .center{ text-align:center }
    .muted{ color:#444; font-size:11px }
    .block{ margin:6px 0 }
    table{width:100%;border-collapse:collapse;margin-top:8px;table-layout:fixed}
    th,td{padding:4px 0;border-bottom:1px solid #ddd;vertical-align:top}
    th{font-weight:bold;background:#f3f4f6}
    .qty{ text-align:center; width:40px }
    .desc{ text-align:left }
    .kvtable{ width:100%; border-collapse:collapse; table-layout:auto }
    .kvtable td{ padding:2px 0; border:0; vertical-align:top; word-break:break-word; overflow-wrap:anywhere }
    .kvtable td.val{ text-align:right; white-space:normal; word-break:break-word; overflow-wrap:anywhere }
    .emph{ font-weight:900; font-size:13px; color:#000 }
    .endline{ border-top:2px dashed #999; margin:12px 0; text-align:center; font-size:10px; color:#666; padding-top:4px }
    .kitchen-note{ text-align:center; font-size:14px; font-weight:bold; color:#c00; margin-top:8px; padding:8px; border:1px dashed #c00; background:#fff8f8 }
  </style>
  </head>
  <body>
    <div class="center" style="border:1px solid #ccc; padding:4px;">${escapeHtml(title)}</div>
    ${tokenNo ? `<div class="center" style="border:1px solid #ccc; padding:4px; margin-top:4px">Token No: <b>${escapeHtml(String(tokenNo))}</b></div>` : ''}
    <div class="block">
      <table class="kvtable"><tbody>
        <tr><td>Date & Time :</td><td class="val"><b>${dateStr} ${timeStr}</b></td></tr>
        ${isReprint ? `<tr><td>Reprint :</td><td class="val"><b>REPRINT</b></td></tr>` : ''}
        ${orderType ? `<tr><td>Order Type :</td><td class="val"><b>${escapeHtml(String(orderType))}</b></td></tr>` : ''}
        ${userName ? `<tr><td>User :</td><td class="val"><b>${escapeHtml(String(userName))}</b></td></tr>` : ''}
        ${waiter ? `<tr><td>Waiter :</td><td class="val">${escapeHtml(String(waiter))}</td></tr>` : ''}
        ${tableDisplay ? `<tr><td>Table :</td><td class="val">${escapeHtml(String(tableDisplay).replace(/^Table /, ''))}</td></tr>` : ''}
        ${rider ? `<tr><td>Rider :</td><td class="val">${escapeHtml(String(rider))}</td></tr>` : ''}
        ${remarks ? `<tr><td>Remarks :</td><td class="val">${escapeHtml(String(remarks))}</td></tr>` : ''}
      </tbody></table>
    </div>

    <table>
      <thead>
        <tr><th class="desc">DESCRIPTION</th><th class="qty">QTY</th></tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="endline">--- END OF ORDER ---</div>
    <div class="kitchen-note">${escapeHtml(kitchenNote)}</div>
  </body>
</html>`
    return html
  } catch {
    return '<html><body><pre>KOT</pre></body></html>'
  }
}

function fmt(n){ return Number(n||0).toLocaleString(undefined,{minimumFractionDigits:0, maximumFractionDigits:2}) }
function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
