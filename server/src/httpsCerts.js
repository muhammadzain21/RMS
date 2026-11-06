import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import selfsigned from 'selfsigned'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const certDir = path.join(__dirname, '../certs')
const keyPath = path.join(certDir, 'key.pem')
const certPath = path.join(certDir, 'cert.pem')

function lanAltNames() {
  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
  ]
  try {
    const ifaces = os.networkInterfaces()
    for (const list of Object.values(ifaces || {})) {
      for (const net of list || []) {
        if (!net || net.internal) continue
        if (net.family === 'IPv4' || net.family === 4) {
          altNames.push({ type: 7, ip: net.address })
        }
      }
    }
  } catch {}
  return altNames
}

/** Load or create a long-lived self-signed cert so Chrome can offer PWA install on LAN. */
export async function getHttpsCerts() {
  try {
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      return {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      }
    }
  } catch {}

  fs.mkdirSync(certDir, { recursive: true })
  const notBefore = new Date()
  const notAfter = new Date(notBefore)
  notAfter.setFullYear(notAfter.getFullYear() + 10)

  const pems = await selfsigned.generate(
    [{ name: 'commonName', value: 'EpicSpire RMS' }],
    {
      keySize: 2048,
      algorithm: 'sha256',
      notBeforeDate: notBefore,
      notAfterDate: notAfter,
      extensions: [
        {
          name: 'subjectAltName',
          altNames: lanAltNames(),
        },
      ],
    }
  )

  if (!pems?.private || !pems?.cert) {
    throw new Error('selfsigned.generate returned empty cert')
  }

  fs.writeFileSync(keyPath, pems.private)
  fs.writeFileSync(certPath, pems.cert)
  return { key: pems.private, cert: pems.cert }
}
