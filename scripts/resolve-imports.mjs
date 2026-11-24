import fs from 'fs'
import path from 'path'

const root = path.resolve('src')
const missing = []

function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(jsx?)$/.test(e.name)) check(p)
  }
}

function check(file) {
  const code = fs.readFileSync(file, 'utf8')
  const dir = path.dirname(file)
  const re = /from\s+['"](\.[^'"]+)['"]/g
  let m
  while ((m = re.exec(code))) {
    let spec = m[1]
    let resolved = path.resolve(dir, spec)
    const tryPaths = [
      resolved,
      resolved + '.js',
      resolved + '.jsx',
      path.join(resolved, 'index.js'),
      path.join(resolved, 'index.jsx'),
    ]
    if (!tryPaths.some(t => fs.existsSync(t))) {
      missing.push(`${path.relative(root, file).split(path.sep).join('/')}: ${spec}`)
    }
  }
}

walk(root)
// also App.jsx
check(path.resolve('src/App.jsx'))

console.log(missing.join('\n'))
console.log('\nMISSING', missing.length)
