import fs from 'fs'
import path from 'path'

const root = path.resolve('src')

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, out)
    else if (/\.(jsx?)$/.test(ent.name)) out.push(p)
  }
  return out
}

let fixed = 0
for (const file of walk(root)) {
  let text = fs.readFileSync(file, 'utf8')
  const uses = /\bexportDateStamp\s*\(/.test(text)
  const hasImport = /import\s*\{[^}]*\bexportDateStamp\b[^}]*\}\s*from/.test(text)
  const isDef = /export function exportDateStamp/.test(text)
  if (!uses || hasImport || isDef) {
    // still fix leftover calendar stamps on export lines
  }

  // Leftover export filenames still using calendar date
  const exportHint = /(downloadCsvFile|previewHtmlReport|\.save\(|a\.download\s*=|reportNo:)/
  const lines = text.split('\n')
  let touched = false
  const next = lines.map((line) => {
    if (!exportHint.test(line)) return line
    if (!line.includes("format(new Date(), 'yyyy-MM-dd')")) return line
    touched = true
    return line.replace(/format\(new Date\(\),\s*'yyyy-MM-dd'\)/g, 'exportDateStamp()')
  })
  if (touched) text = next.join('\n')

  const needsImport = /\bexportDateStamp\s*\(/.test(text) && !/import\s*\{[^}]*\bexportDateStamp\b[^}]*\}\s*from/.test(text) && !/export function exportDateStamp/.test(text)
  if (needsImport) {
    if (/from ['"][^'"]*listReportExport\.js['"]/.test(text)) {
      text = text.replace(
        /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]*listReportExport\.js)['"]/,
        (m, names, mod) => {
          if (/\bexportDateStamp\b/.test(names)) return m
          return `import { ${names.trim().replace(/,\s*$/, '')}, exportDateStamp } from '${mod}'`
        }
      )
    } else {
      const rel = path.relative(path.dirname(file), path.join(root, 'utils', 'listReportExport.js')).replace(/\\/g, '/')
      const mod = rel.startsWith('.') ? rel : `./${rel}`
      const importLine = `import { exportDateStamp } from '${mod}'\n`
      text = text.replace(/^(import .+?\n)/m, `$1${importLine}`)
    }
    touched = true
  }

  if (touched || needsImport) {
    fs.writeFileSync(file, text)
    fixed += 1
    console.log('fixed', path.relative(root, file))
  }
}
console.log('fixed files:', fixed)
