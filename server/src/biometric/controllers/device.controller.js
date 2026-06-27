import { env } from '../../config/env.js'

function normalizeUserRows(result) {
  if (!result) return []
  if (Array.isArray(result)) return result
  if (Array.isArray(result.data)) return result.data
  if (Array.isArray(result.users)) return result.users
  if (Array.isArray(result.items)) return result.items
  return []
}

function getEnrollId(row) {
  const v = row.deviceUserId ?? row.userId ?? row.uid ?? row.id ?? row.userSN ?? row.userSn
  return String(v ?? '').trim()
}

function getName(row) {
  const v = row.name ?? row.username
  return String(v ?? '').trim()
}

export async function listDeviceUsers(_req, res) {
  if (!env.BIOMETRIC_ENABLED) return res.status(400).json({ message: 'Biometric is disabled' })
  if (!env.BIOMETRIC_IP) return res.status(400).json({ message: 'BIOMETRIC_IP is not set' })

  const { default: ZKLib } = await import('node-zklib')
  const deviceId = String(env.BIOMETRIC_DEVICE_ID || 'ZK-01')
  const ip = String(env.BIOMETRIC_IP)
  const port = Number(env.BIOMETRIC_PORT || 4370)
  const password = Number(env.BIOMETRIC_COMM_PASSWORD || 0)

  const zk = new ZKLib(ip, port, 10000, 5200, password)
  try {
    await zk.createSocket()
    const raw = await zk.getUsers()
    const rows = normalizeUserRows(raw)

    const users = rows
      .map(r => ({ enrollId: getEnrollId(r), name: getName(r) }))
      .filter(x => !!x.enrollId)
      .sort((a, b) => Number(a.enrollId) - Number(b.enrollId))

    res.json({ deviceId, users, total: users.length })
  } catch (e) {
    const msg = e?.message || String(e) || 'Unknown error'
    console.error('[biometric] listDeviceUsers failed:', msg)
    return res.status(503).json({ message: 'Biometric device unreachable', error: msg, ip, port })
  } finally {
    try { await zk.disconnect() } catch {}
  }
}
