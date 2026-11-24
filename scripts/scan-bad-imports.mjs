import fs from 'fs'
import path from 'path'

const root = 'src'
const bad = []

function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(jsx?)$/.test(e.name)) {
      const code = fs.readFileSync(p, 'utf8')
      const rel = p.split(path.sep).join('/')
      const lines = code.split(/\n/)
      lines.forEach((line, i) => {
        if (!/from ['"]|import\(/.test(line)) return
        const hits = []
        if (/pages\/my\/|my\/myWorkPages|ui\/PageHero|components\/sales|utils\/sales|customers\/customerLedger|\/engines\/|\/shared\/common|\.\/print\//.test(line)) {
          hits.push('OLD_PATH')
        }
        // From pages/components/utils, ../../ should not be needed for src roots
        if (
          (rel.startsWith('src/pages/') || rel.startsWith('src/components/') || rel.startsWith('src/utils/')) &&
          /from ['"]\.\.\/\.\.\//.test(line)
        ) {
          hits.push('TOO_DEEP')
        }
        if (hits.length) bad.push(`${hits.join('+')} ${rel}:${i + 1}: ${line.trim()}`)
      })
    }
  }
}

walk(root)
console.log(bad.join('\n'))
console.log('\nTOTAL', bad.length)
