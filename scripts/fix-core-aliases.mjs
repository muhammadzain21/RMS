import fs from 'fs'
import path from 'path'

const root = 'src'
const files = []
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(jsx?)$/.test(e.name)) files.push(p)
  }
}
walk(root)

const cores = ['hooks', 'layout', 'sync', 'state', 'native']
let n = 0
for (const f of files) {
  let c = fs.readFileSync(f, 'utf8')
  const o = c
  for (const core of cores) {
    const re = new RegExp(`from (['"])\\.\\./(?:\\.\\./)?${core}/`, 'g')
    c = c.replace(re, `from $1@/${core}/`)
  }
  if (c !== o) {
    fs.writeFileSync(f, c)
    n++
    console.log('fixed', path.relative(root, f).split(path.sep).join('/'))
  }
}
console.log('count', n)
