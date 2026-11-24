import fs from 'fs'
import path from 'path'
import { destFor, PAGE_FEATURE, COMPONENT_FEATURE, UTIL_FEATURE } from './feature-map.mjs'

const srcRoot = path.resolve('src')

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
}

function moveFile(fromRel, toRel) {
  const from = path.join(srcRoot, fromRel)
  const to = path.join(srcRoot, toRel)
  if (!fs.existsSync(from)) throw new Error(`Missing ${fromRel}`)
  if (fs.existsSync(to)) throw new Error(`Exists ${toRel}`)
  ensureDir(to)
  fs.renameSync(from, to)
  console.log(`move ${fromRel} -> ${toRel}`)
}

// 1) Move everything
for (const file of fs.readdirSync(path.join(srcRoot, 'pages'))) {
  if (!/\.jsx?$/.test(file)) continue
  moveFile(`pages/${file}`, destFor('page', file))
}
for (const file of fs.readdirSync(path.join(srcRoot, 'components'))) {
  if (!/\.jsx?$/.test(file)) continue
  moveFile(`components/${file}`, destFor('component', file))
}
for (const file of fs.readdirSync(path.join(srcRoot, 'utils'))) {
  if (!/\.jsx?$/.test(file)) continue
  moveFile(`utils/${file}`, destFor('util', file))
}

// Remove empty dirs
for (const d of ['pages', 'components', 'utils']) {
  const p = path.join(srcRoot, d)
  if (fs.existsSync(p) && fs.readdirSync(p).length === 0) {
    fs.rmdirSync(p)
    console.log('rmdir', d)
  }
}

// 2) Build basename -> alias import map (prefer unique basenames)
const aliasByBase = new Map()
function addAlias(base, alias) {
  if (aliasByBase.has(base) && aliasByBase.get(base) !== alias) {
    console.warn(`DUPLICATE basename ${base}: ${aliasByBase.get(base)} vs ${alias}`)
  }
  aliasByBase.set(base, alias)
}

function walk(dir, prefix) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, prefix)
    else if (/\.(jsx?)$/.test(e.name)) {
      const rel = path.relative(srcRoot, p).split(path.sep).join('/')
      const base = e.name
      if (rel.startsWith('features/')) addAlias(base, `@features/${rel.slice('features/'.length)}`)
      else if (rel.startsWith('shared/')) addAlias(base, `@shared/${rel.slice('shared/'.length)}`)
    }
  }
}
walk(path.join(srcRoot, 'features'), 'features')
walk(path.join(srcRoot, 'shared'), 'shared')

// Special: state/hooks/layout/sync/native
addAlias('DataContext.jsx', '@/state/DataContext.jsx')
addAlias('AuthContext.jsx', '@/state/AuthContext.jsx')
addAlias('BranchContext.jsx', '@/state/BranchContext.jsx')
// don't map all by basename for hooks - rewrite by path resolve instead

// 3) Rewrite imports in all src files
const files = []
function collect(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) collect(p)
    else if (/\.(jsx?|tsx?)$/.test(e.name)) files.push(p)
  }
}
collect(srcRoot)

function toAlias(absFile) {
  const rel = path.relative(srcRoot, absFile).split(path.sep).join('/')
  if (rel.startsWith('features/')) return `@features/${rel.slice('features/'.length)}`
  if (rel.startsWith('shared/')) return `@shared/${rel.slice('shared/'.length)}`
  if (rel.startsWith('state/')) return `@/${rel}`
  if (rel.startsWith('hooks/')) return `@/${rel}`
  if (rel.startsWith('layout/')) return `@/${rel}`
  if (rel.startsWith('sync/')) return `@/${rel}`
  if (rel.startsWith('native/')) return `@/${rel}`
  return null
}

function rewriteFile(file) {
  let code = fs.readFileSync(file, 'utf8')
  const orig = code
  const dir = path.dirname(file)

  code = code.replace(/(from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g, (full, prefix, spec) => {
    // Already aliased
    if (spec.startsWith('@features/') || spec.startsWith('@shared/') || spec.startsWith('@/')) {
      return full
    }
    // Relative or absolute-ish
    if (spec.startsWith('.')) {
      let resolved = path.resolve(dir, spec)
      const candidates = [
        resolved,
        resolved + '.js',
        resolved + '.jsx',
        path.join(resolved, 'index.js'),
        path.join(resolved, 'index.jsx'),
      ]
      const hit = candidates.find(c => fs.existsSync(c))
      if (hit) {
        const alias = toAlias(hit)
        if (alias) return `${prefix}'${alias}'`
      }
      // Fallback by basename
      const base = path.basename(spec).replace(/\?.*$/, '')
      const withExt = base.includes('.') ? base : null
      if (withExt && aliasByBase.has(withExt)) {
        return `${prefix}'${aliasByBase.get(withExt)}'`
      }
      // try adding extensions for basename map
      for (const ext of ['.jsx', '.js']) {
        const b = base.endsWith(ext) ? base : base + ext
        if (aliasByBase.has(b)) return `${prefix}'${aliasByBase.get(b)}'`
      }
    }
    // Old flat paths still referenced
    const m1 = spec.match(/^(?:\.\.\/)+(?:pages|components|utils)\/(.+)$/)
    if (m1) {
      const base = path.basename(m1[1])
      if (aliasByBase.has(base)) return `${prefix}'${aliasByBase.get(base)}'`
    }
    const m2 = spec.match(/^\.\/(pages|components|utils)\/(.+)$/)
    if (m2) {
      const base = path.basename(m2[2])
      if (aliasByBase.has(base)) return `${prefix}'${aliasByBase.get(base)}'`
    }
    return full
  })

  if (code !== orig) {
    fs.writeFileSync(file, code)
    return true
  }
  return false
}

let n = 0
for (const f of files) if (rewriteFile(f)) n++
console.log('rewrote', n, 'files')

// 4) Rewrite App.jsx page imports explicitly if needed
const appPath = path.join(srcRoot, 'App.jsx')
let app = fs.readFileSync(appPath, 'utf8')
app = app.replace(/from ['"]\.\/pages\/([^'"]+)['"]/g, (_, base) => {
  const name = base.replace(/\.(jsx?)$/, '')
  const feature = PAGE_FEATURE[name]
  if (!feature) throw new Error(`App import unknown page ${base}`)
  return `from '@features/${feature}/pages/${base.includes('.') ? base : base + '.jsx'}'`
})
app = app.replace(/from ['"]\.\/components\/([^'"]+)['"]/g, (_, base) => {
  const file = base.includes('.') ? base : base + '.jsx'
  const name = file.replace(/\.(jsx?)$/, '')
  const feature = COMPONENT_FEATURE[name]
  if (!feature) throw new Error(`App import unknown component ${base}`)
  if (feature === 'shared') return `from '@shared/components/${file}'`
  return `from '@features/${feature}/components/${file}'`
})
fs.writeFileSync(appPath, app)
console.log('App.jsx aliases updated')

console.log('DONE')
console.log('pages features', Object.keys(PAGE_FEATURE).length)
console.log('component features', Object.keys(COMPONENT_FEATURE).length)
console.log('util features', Object.keys(UTIL_FEATURE).length)
