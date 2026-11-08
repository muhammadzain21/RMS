import fs from 'fs'
import path from 'path'

const root = 'src'
function walk(d, a = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p, a)
    else if (/\.(jsx?)$/.test(e.name)) a.push(p)
  }
  return a
}

let missing = 0
let leftover = 0
for (const f of walk(root)) {
  const t = fs.readFileSync(f, 'utf8')
  if (/\bexportDateStamp\s*\(/.test(t) && !/import\s*\{[^}]*exportDateStamp/.test(t) && !/export function exportDateStamp/.test(t)) {
    console.log('MISSING IMPORT', f)
    missing++
  }
  for (const line of t.split('\n')) {
    if (/(downloadCsvFile|previewHtmlReport|\.save\(|a\.download\s*=)/.test(line) && line.includes("format(new Date(), 'yyyy-MM-dd')")) {
      console.log('LEFTOVER', f, '::', line.trim().slice(0, 140))
      leftover++
    }
  }
}
console.log({ missing, leftover })
