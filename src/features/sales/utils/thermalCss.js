/**
 * Thermal roll + professional typography (preview & print share the same CSS).
 * Hierarchy: muted labels, medium body, semibold totals — not all-black heavy text.
 */
export const THERMAL_SLIP_CSS = `
  @page { size: 80mm auto; margin: 0; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 72mm;
    max-width: 72mm;
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
    box-sizing: border-box;
    background: #fff !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  *, *::before, *::after { box-sizing: border-box; }
  img { max-width: 100% !important; height: auto !important; }
  .toolbar, .no-print { display: none !important; }
  @media print {
    html, body {
      width: 72mm !important;
      max-width: 72mm !important;
      height: auto !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 2mm 5mm 2mm 2mm !important;
      overflow: visible !important;
    }
    .toolbar, .no-print { display: none !important; }
  }
  @media screen {
    html, body {
      width: 100%;
      max-width: 100%;
      margin: 0 auto;
      padding: 4px 14px 8px 6px;
    }
  }
`

/** Shared visual language for bill + KOT slips (dialog preview === printed output). */
export const PROFESSIONAL_SLIP_CSS = `
  /* Arial prints clearest on thermal; everything bold */
  html, body, body * {
    font-family: Arial, Helvetica, sans-serif !important;
    font-weight: 700 !important;
    -webkit-font-smoothing: antialiased;
  }
  body {
    font-size: 12px;
    line-height: 1.45;
    color: #111827;
    letter-spacing: 0.015em;
    padding-right: 4mm !important;
  }
  b, strong { font-weight: 700 !important; }
  .center { text-align: center; }
  .brand { text-align: center; margin-bottom: 8px; padding-right: 2mm; }
  .brand img {
    display: block;
    margin: 0 auto 6px;
    max-height: 52px;
    max-width: 82%;
    object-fit: contain;
  }
  .brand-name {
    margin: 0 0 4px;
    font-size: 16px !important;
    font-weight: 700 !important;
    color: #111827;
    line-height: 1.2;
  }
  .brand-meta {
    margin: 2px 0;
    font-size: 11px !important;
    font-weight: 700 !important;
    color: #111827;
  }
  .chip {
    display: block;
    margin: 6px 2mm 0 0;
    padding: 6px 8px;
    border: 1px solid #94a3b8;
    border-radius: 6px;
    text-align: center;
    font-size: 12px !important;
    font-weight: 700 !important;
    color: #111827;
    background: #f8fafc;
  }
  .chip-token {
    border-color: #60a5fa;
    background: #eff6ff;
    color: #0f172a;
    font-size: 14px !important;
    font-weight: 900 !important;
  }
  .chip-token .token-num {
    font-size: 20px !important;
    font-weight: 900 !important;
    letter-spacing: 0.04em;
  }
  .block { margin: 8px 4mm 8px 0; }
  .muted { color: #111827; font-size: 11px !important; font-weight: 700 !important; }
  .emph { font-weight: 700 !important; color: #111827; }
  .kvtable {
    width: calc(100% - 4mm);
    border-collapse: collapse;
    table-layout: auto;
    margin: 0 4mm 0 0;
  }
  .kvtable td {
    padding: 4px 0;
    border: 0;
    border-bottom: 1px solid #e5e7eb;
    font-size: 12px !important;
    font-weight: 700 !important;
    color: #111827;
    vertical-align: top;
    word-break: break-word;
  }
  .kvtable td.val {
    text-align: right;
    color: #111827;
    font-weight: 700 !important;
    padding-left: 8px;
    white-space: normal;
  }
  table.items {
    width: calc(100% - 4mm);
    border-collapse: collapse;
    margin-top: 6px;
    margin-right: 4mm;
    table-layout: fixed;
  }
  table.items th, table.items td { padding: 5px 2px; vertical-align: top; }
  table.items th {
    font-size: 11px !important;
    font-weight: 700 !important;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: #111827;
    border-bottom: 1px solid #cbd5e1;
    background: transparent;
  }
  table.items td {
    font-size: 12px !important;
    font-weight: 700 !important;
    color: #111827;
    border-bottom: 1px solid #e5e7eb;
    word-break: break-word;
  }
  .desc { width: 46%; text-align: left; }
  th.desc { text-align: left; }
  .qty { width: 14%; text-align: right; }
  .rate { width: 20%; text-align: right; }
  .amount { width: 20%; text-align: right; font-variant-numeric: tabular-nums; }
  table.items tr.cat-head td {
    border-bottom: 1px solid #94a3b8;
    padding-top: 8px;
    font-size: 12px !important;
    font-weight: 900 !important;
    text-transform: none;
  }
  table.items tr.cat-item td.desc { padding-left: 6px; }
  table.items tr.cat-price td {
    border-bottom: 1px solid #cbd5e1;
    font-weight: 900 !important;
  }
  .kv {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    margin: 3px 4mm 3px 0;
    font-size: 12px !important;
    font-weight: 700 !important;
    color: #111827;
  }
  .kv span:first-child { flex: 1 1 auto; min-width: 0; font-weight: 700 !important; }
  .kv span:last-child {
    flex: 0 0 auto;
    color: #111827;
    font-weight: 700 !important;
    font-variant-numeric: tabular-nums;
    text-align: right;
    max-width: 48%;
    word-break: break-word;
  }
  .hr {
    border: 0;
    border-top: 1px dashed #94a3b8;
    margin: 8px 4mm 8px 0;
  }
  .totals { margin-top: 2px; margin-right: 4mm; }
  .total {
    font-size: 13px !important;
    font-weight: 700 !important;
    color: #111827 !important;
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1px solid #cbd5e1;
  }
  .total span { color: #111827 !important; font-weight: 700 !important; }
  .footer {
    margin: 10px 2mm 0 0;
    padding-top: 6px;
    border-top: 1px dashed #94a3b8;
    text-align: center;
    font-size: 11px !important;
    font-weight: 700 !important;
    color: #111827;
    white-space: pre-wrap;
    line-height: 1.35;
  }
  .pay-qr {
    margin: 10px 2mm 0 0;
    padding-top: 8px;
    border-top: 1px dashed #94a3b8;
    text-align: center;
  }
  .pay-qr-label {
    margin: 0 0 6px;
    font-size: 11px !important;
    font-weight: 700 !important;
    color: #111827;
  }
  .pay-qr img {
    display: block;
    margin: 0 auto;
    width: 38mm;
    height: 38mm;
    object-fit: contain;
    image-rendering: pixelated;
  }
  .pay-qr-hint {
    margin: 4px 0 0;
    font-size: 10px !important;
    font-weight: 700 !important;
    color: #334155;
    word-break: break-all;
  }
  .endline {
    border-top: 1px dashed #94a3b8;
    margin: 10px 2mm 6px 0;
    text-align: center;
    font-size: 11px !important;
    font-weight: 700 !important;
    letter-spacing: 0.04em;
    color: #111827;
    padding-top: 6px;
  }
  .kitchen-note {
    text-align: center;
    font-size: 12px !important;
    font-weight: 700 !important;
    color: #b91c1c;
    margin: 6px 2mm 0 0;
    padding: 6px 8px;
    border: 1px dashed #fca5a5;
    border-radius: 6px;
    background: #fff7f7;
  }
  .toolbar { display: none !important; }
`
