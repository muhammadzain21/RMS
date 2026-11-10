import { env, reloadBiometricConfig } from '../../config/env.js'
import { connectZk, disconnectZk, formatZkErr } from '../zkConnect.js'

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

export async function listDeviceUsers(req, res) {
  let branchId = ''
  try {
    const { resolveBranchId } = await import('../../utils/branchScope.js')
    branchId = resolveBranchId(req) || ''
  } catch { branchId = '' }
  await reloadBiometricConfig(branchId)
  if (!env.BIOMETRIC_ENABLED) return res.status(400).json({ message: 'Biometric is disabled' })
  if (!env.BIOMETRIC_IP) return res.status(400).json({ message: 'BIOMETRIC_IP is not set' })

  const deviceId = String(env.BIOMETRIC_DEVICE_ID || 'ZK-01')
  const ip = String(env.BIOMETRIC_IP)
  const port = Number(env.BIOMETRIC_PORT || 4370)
  const password = Number(env.BIOMETRIC_COMM_PASSWORD || 0)

  const fetchUsers = async (pwd) => {
    const { zk } = await connectZk({ ip, port, password: pwd })
    try {
      const raw = await zk.getUsers()
      const rows = normalizeUserRows(raw)
      return rows
        .map(r => ({ enrollId: getEnrollId(r), name: getName(r) }))
        .filter(x => !!x.enrollId)
        .sort((a, b) => Number(a.enrollId) - Number(b.enrollId))
    } finally {
      await disconnectZk(zk)
    }
  }

  try {
    let users
    try {
      users = await fetchUsers(password)
    } catch (e) {
      console.warn('[biometric] listDeviceUsers first attempt failed:', formatZkErr(e))
      await new Promise(r => setTimeout(r, 1500))
      try {
        users = await fetchUsers(password)
      } catch (e2) {
        if (password && password !== 0) {
          console.warn('[biometric] listDeviceUsers retrying with COMM password 0:', formatZkErr(e2))
          users = await fetchUsers(0)
        } else {
          throw e2
        }
      }
    }
    res.json({ deviceId, users, total: users.length })
  } catch (e) {
    const msg = formatZkErr(e)
    console.error('[biometric] listDeviceUsers failed:', msg)
    return res.status(503).json({ message: 'Biometric device unreachable', error: msg, ip, port })
  }
}
