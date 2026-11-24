import fs from 'fs'

const rangePages = [
  ['src/features/sales/pages/DeletedSales.jsx', 'fromDate', 'toDate'],
  ['src/features/sales/pages/VoidHistory.jsx', 'fromDate', 'toDate'],
  ['src/features/sales/pages/ReturnHistory.jsx', 'fromDate', 'toDate'],
  ['src/features/sales/pages/KotHistory.jsx', 'fromDate', 'toDate'],
  ['src/features/sales/pages/SalesSummary.jsx', 'fromDate', 'toDate'],
  ['src/features/day/pages/PayInOut.jsx', 'from', 'to'],
  ['src/features/suppliers/pages/SupplyHistory.jsx', 'from', 'to'],
  ['src/features/inventory/pages/DemandList.jsx', 'dateFrom', 'dateTo'],
]

const singlePages = [
  ['src/features/expenses/pages/ExpenseHistory.jsx', 'date'],
  ['src/features/sales/pages/KDS.jsx', 'selectedDate'],
  ['src/features/sales/pages/ReturnNew.jsx', 'date'],
  ['src/features/suppliers/pages/SupplyNew.jsx', 'date'],
]

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function ensureImport(code, named) {
  if (code.includes('useBusinessDateFilter') || code.includes('useBusinessDateValue')) return code
  const line = `import { ${named} } from '@/hooks/useBusinessDateFilter.js'\n`
  if (code.includes("@/hooks/useLiveRefresh.js'")) {
    return code.replace("from '@/hooks/useLiveRefresh.js'", `from '@/hooks/useLiveRefresh.js'\nimport { ${named} } from '@/hooks/useBusinessDateFilter.js'`)
  }
  if (code.includes('from \'react\'')) {
    return code.replace(/from 'react'.*\n/, (m) => m + line)
  }
  return line + code
}

for (const [file, fromName, toName] of rangePages) {
  let c = fs.readFileSync(file, 'utf8')
  if (c.includes('useBusinessDateFilter()')) {
    console.log('skip', file)
    continue
  }
  c = ensureImport(c, 'useBusinessDateFilter')
  const setFrom = 'set' + cap(fromName)
  const setTo = 'set' + cap(toName)
  const re = new RegExp(
    `const \\[${fromName}, ${setFrom}\\] = useState\\([^\\n]*\\)\\s*\\n\\s*const \\[${toName}, ${setTo}\\] = useState\\([^\\n]*\\)`
  )
  if (!re.test(c)) {
    console.log('NOMATCH', file)
    continue
  }
  c = c.replace(
    re,
    `const { from: ${fromName}, setFrom: ${setFrom}, to: ${toName}, setTo: ${setTo} } = useBusinessDateFilter()`
  )
  c = c.replace(/\n\s*useEffect\(\(\)\s*=>\s*\{\s*if \(businessDate && !fromDate\) setFromDate\(businessDate\)\s*\}, \[businessDate\]\)\s*/g, '\n')
  fs.writeFileSync(file, c)
  console.log('updated', file)
}

for (const [file, name] of singlePages) {
  let c = fs.readFileSync(file, 'utf8')
  if (c.includes('useBusinessDateValue')) {
    console.log('skip', file)
    continue
  }
  c = ensureImport(c, 'useBusinessDateValue')
  const setter = 'set' + cap(name)
  const re = new RegExp(`const \\[${name}, ${setter}\\] = useState\\([^\\n]*\\)`)
  if (!re.test(c)) {
    console.log('NOMATCH-single', file)
    continue
  }
  c = c.replace(re, `const [${name}, ${setter}] = useBusinessDateValue()`)
  fs.writeFileSync(file, c)
  console.log('updated-single', file)
}
