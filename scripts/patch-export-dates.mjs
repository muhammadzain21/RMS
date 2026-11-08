import fs from 'fs'
import path from 'path'

const root = path.resolve('src')
const exportHint = /(downloadCsvFile|previewHtmlReport|\.save\(|a\.download\s*=|reportNo:)/

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === 'dist') continue
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, out)
    else if (/\.(jsx?|tsx?)$/.test(ent.name)) out.push(p)
  }
  return out
}

function ensureImport(file, text) {
  if (/\bexportDateStamp\b/.test(text) && /import\s*\{[^}]*\bexportDateStamp\b[^}]*\}\s*from/.test(text)) {
    return text
  }
  if (/from ['"][^'"]*listReportExport\.js['"]/.test(text)) {
    return text.replace(
      /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]*listReportExport\.js)['"]/,
      (m, names, mod) => {
        if (/\bexportDateStamp\b/.test(names)) return m
        const cleaned = names.trim().replace(/,\s*$/, '')
        return `import { ${cleaned}, exportDateStamp } from '${mod}'`
      }
    )
  }
  const rel = path.relative(path.dirname(file), path.join(root, 'utils', 'listReportExport.js')).replace(/\\/g, '/')
  const mod = rel.startsWith('.') ? rel : `./${rel}`
  const importLine = `import { exportDateStamp } from '${mod}'\n`
  if (/^import /m.test(text)) {
    return text.replace(/^(import .+?\n)/m, `$1${importLine}`)
  }
  return importLine + text
}

let changed = 0
for (const file of walk(root)) {
  let text = fs.readFileSync(file, 'utf8')
  if (!text.includes("format(new Date(), 'yyyy-MM-dd')") && !text.includes('format(new Date(), "yyyy-MM-dd")')) continue

  const lines = text.split('\n')
  let fileTouched = false
  const next = lines.map((line) => {
    if (!exportHint.test(line)) return line
    if (!line.includes("format(new Date(), 'yyyy-MM-dd')") && !line.includes('format(new Date(), "yyyy-MM-dd")')) return line
    const replaced = line
      .replace(/format\(new Date\(\),\s*'yyyy-MM-dd'\)/g, 'exportDateStamp()')
      .replace(/format\(new Date\(\),\s*"yyyy-MM-dd"\)/g, 'exportDateStamp()')
    if (replaced !== line) fileTouched = true
    return replaced
  })
  if (!fileTouched) continue

  text = ensureImport(file, next.join('\n'))
  text = text.replace(/exportDateStamp,\s*exportDateStamp/g, 'exportDateStamp')
  fs.writeFileSync(file, text)
  changed += 1
  console.log('updated', path.relative(root, file))
}
console.log('files changed:', changed)
