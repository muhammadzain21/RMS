import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

const srcRoot = path.resolve('src')
const aliases = {
  '@features': path.join(srcRoot, 'features'),
  '@shared': path.join(srcRoot, 'shared'),
  '@': srcRoot,
}

function resolveSpec(fromFile, spec) {
  if (spec.startsWith('@features/')) return path.join(aliases['@features'], spec.slice('@features/'.length))
  if (spec.startsWith('@shared/')) return path.join(aliases['@shared'], spec.slice('@shared/'.length))
  if (spec.startsWith('@/')) return path.join(aliases['@'], spec.slice(2))
  if (spec.startsWith('.')) return path.resolve(path.dirname(fromFile), spec)
  return null
}

function existsModule(resolved) {
  const tries = [resolved, resolved + '.js', resolved + '.jsx', path.join(resolved, 'index.js'), path.join(resolved, 'index.jsx')]
  return tries.find(t => fs.existsSync(t))
}

const missing = []
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(jsx?)$/.test(e.name)) {
      const code = fs.readFileSync(p, 'utf8')
      const re = /from\s+['"]([^'"]+)['"]/g
      let m
      while ((m = re.exec(code))) {
        const spec = m[1]
        if (!(spec.startsWith('.') || spec.startsWith('@'))) continue
        const resolved = resolveSpec(p, spec)
        if (!resolved) continue
        if (!existsModule(resolved)) {
          missing.push(`${path.relative(srcRoot, p).split(path.sep).join('/')}: ${spec}`)
        }
      }
    }
  }
}
walk(srcRoot)
console.log(missing.join('\n'))
console.log('MISSING', missing.length)
