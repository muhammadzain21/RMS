import fs from 'fs'
import path from 'path'

const files = [
  'src/pages/AuditLog.jsx',
  'src/pages/DataManager.jsx',
  'src/pages/DemandList.jsx',
  'src/pages/expenses/ExpenseHistory.jsx',
  'src/pages/sales/AdvanceBooking.jsx',
  'src/pages/sales/CashOpening.jsx',
  'src/pages/sales/DeletedSales.jsx',
  'src/pages/sales/KotHistory.jsx',
  'src/pages/sales/PayInOut.jsx',
  'src/pages/sales/ReturnHistory.jsx',
  'src/pages/sales/VoidHistory.jsx',
  'src/pages/supply/SupplyHistory.jsx',
]

for (const file of files) {
  let text = fs.readFileSync(file, 'utf8')
  if (/import\s*\{[^}]*\bexportDateStamp\b/.test(text)) {
    console.log('ok', file)
    continue
  }
  const rel = path.relative(path.dirname(file), path.join('src', 'utils', 'listReportExport.js')).replace(/\\/g, '/')
  const mod = rel.startsWith('.') ? rel : `./${rel}`
  const line = `import { exportDateStamp } from '${mod}'\n`
  // Insert after last import block line
  const m = text.match(/^(?:import[\s\S]*?\n)(?!import )/)
  if (m) {
    text = text.slice(0, m[0].length) + line + text.slice(m[0].length)
  } else {
    text = line + text
  }
  fs.writeFileSync(file, text)
  console.log('added', file, '->', mod)
}
